import fs from 'fs';
import path from 'path';

import { DocumentId } from '@automerge/automerge-repo';
import { projectFrontmatterSchema } from '@awesome-myst/myst-zod';
import {
  AvailableUserActionLogTypes,
  ManifestActions,
  ResearchObjectComponentType,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import { ActionType } from '@prisma/client';
import { NextFunction, Response } from 'express';
import { load } from 'js-yaml';
import { rimraf } from 'rimraf';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequestWithNode, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { processS3DataToIpfs } from '../../services/data/processing.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { getNodeByUuid } from '../../services/node.js';
import repoService from '../../services/repoService.js';
import { extractZipFileAndCleanup } from '../../utils.js';

export const TEMP_MECA_PATH = './repo-tmp/meca';

// Configurable size limit for MECA archive processing (default: 500MB)
const MAX_MECA_TOTAL_SIZE_BYTES = parseInt(process.env.MECA_MAX_TOTAL_SIZE_BYTES || '524288000', 10);
// Maximum number of files allowed in a MECA archive
const MAX_MECA_FILE_COUNT = parseInt(process.env.MECA_MAX_FILE_COUNT || '1000', 10);

const logger = parentLogger.child({
  module: 'NODE::mecaImport',
});

export const mecaImportSchema = z.object({
  params: z.object({
    uuid: z.string(),
  }),
  body: z.object({
    dryRun: z
      .string()
      .transform((val) => val === 'true')
      .optional()
      .default('false'),
  }),
});

const mystYamlSchema = z.object({
  version: z.number(),
  project: z.object({
    id: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    authors: z
      .array(
        z.object({
          name: z.string(),
          email: z.string().optional(),
          affiliation: z.string().optional(),
          orcid: z.string().optional(),
        }),
      )
      .optional(),
  }),
});

/**
 * Parse and validate the myst.yml file from the extracted MECA bundle
 */
const parseMystYaml = async (yamlPath: string) => {
  try {
    if (!fs.existsSync(yamlPath)) {
      return { ok: false, error: 'myst.yml not found in bundle' };
    }

    const yamlText = await fs.promises.readFile(yamlPath, 'utf-8');
    const parsedYaml = load(yamlText, { json: true }) as Record<string, unknown>;

    const parsedProject = projectFrontmatterSchema.safeParse(parsedYaml['project']);
    if (parsedProject.error) {
      logger.error({ error: parsedProject.error }, 'Project frontmatter validation failed');
      return { ok: false, error: 'myst.yml project validation failed' };
    }

    const parsed = mystYamlSchema.safeParse(parsedYaml);
    if (parsed.error) {
      logger.error({ error: parsed.error }, 'MyST YAML validation failed');
      return { ok: false, error: 'myst.yml validation failed' };
    }

    // if (!parsedYaml['project']) {
    //   return { ok: false, error: 'Missing project metadata in myst.yml' };
    // }

    return {
      ok: true,
      data: { ...parsedProject.data, authors: parsed.data.project.authors },
    };
  } catch (error) {
    logger.error({ error }, 'Failed to parse myst.yml');
    return { ok: false, error: 'Failed to parse myst.yml' };
  }
};

/**
 * Error thrown when file collection exceeds safety limits
 */
class FileCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileCollectionError';
  }
}

/**
 * Verifies that a resolved path is safely contained within the base directory
 */
const isPathSafelyContained = (resolvedPath: string, basePath: string): boolean => {
  const normalizedBase = path.resolve(basePath) + path.sep;
  const normalizedResolved = path.resolve(resolvedPath);
  return normalizedResolved.startsWith(normalizedBase) || normalizedResolved === path.resolve(basePath);
};

/**
 * File metadata collected during directory walk (before reading content)
 */
interface FileMetadata {
  fullPath: string;
  relativePath: string;
  size: number;
}

/**
 * Collect file metadata from extracted MECA directory (without reading content)
 * This allows us to enforce size limits before loading files into memory
 */
const collectFileMetadata = async (
  extractedPath: string,
  maxTotalSize: number = MAX_MECA_TOTAL_SIZE_BYTES,
  maxFileCount: number = MAX_MECA_FILE_COUNT,
): Promise<FileMetadata[]> => {
  const fileMetadata: FileMetadata[] = [];
  let totalSize = 0;
  const resolvedBasePath = await fs.promises.realpath(extractedPath);

  const walkDir = async (dir: string, basePath: string = '') => {
    // Use lstat to get info without following symlinks
    const dirStat = await fs.promises.lstat(dir);
    if (dirStat.isSymbolicLink()) {
      logger.warn({ dir }, 'MECA::Skipping symlinked directory');
      return;
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = basePath ? path.join(basePath, entry.name) : entry.name;

      // Use lstat to detect symlinks without following them
      const stat = await fs.promises.lstat(fullPath);

      if (stat.isSymbolicLink()) {
        logger.warn({ fullPath, relativePath }, 'MECA::Skipping symlink for security');
        continue;
      }

      if (stat.isDirectory()) {
        // Verify directory path is still within extracted path
        const resolvedDir = await fs.promises.realpath(fullPath);
        if (!isPathSafelyContained(resolvedDir, resolvedBasePath)) {
          logger.warn({ fullPath, resolvedDir, resolvedBasePath }, 'MECA::Directory path escapes extraction boundary');
          throw new FileCollectionError(`Directory path traversal detected: ${relativePath}`);
        }
        await walkDir(fullPath, relativePath);
      } else if (stat.isFile()) {
        // Verify file path is safely contained within extraction directory
        const resolvedFile = await fs.promises.realpath(fullPath);
        if (!isPathSafelyContained(resolvedFile, resolvedBasePath)) {
          logger.warn({ fullPath, resolvedFile, resolvedBasePath }, 'MECA::File path escapes extraction boundary');
          throw new FileCollectionError(`File path traversal detected: ${relativePath}`);
        }

        // Check file count limit
        if (fileMetadata.length >= maxFileCount) {
          throw new FileCollectionError(
            `MECA archive exceeds maximum file count of ${maxFileCount}. Consider splitting into smaller archives.`,
          );
        }

        // Check total size limit before adding
        totalSize += stat.size;
        if (totalSize > maxTotalSize) {
          throw new FileCollectionError(
            `MECA archive exceeds maximum total size of ${Math.round(maxTotalSize / 1024 / 1024)}MB. ` +
              `Consider splitting into smaller archives or contact support for large imports.`,
          );
        }

        fileMetadata.push({
          fullPath: resolvedFile,
          relativePath,
          size: stat.size,
        });
      }
      // Skip other file types (block devices, character devices, FIFOs, sockets)
    }
  };

  await walkDir(extractedPath);
  return fileMetadata;
};

/**
 * Read files in batches to avoid memory pressure
 * @param metadata File metadata to process
 * @param batchSize Number of files to read at once (default: 50)
 */
const readFilesInBatches = async (metadata: FileMetadata[], batchSize: number = 50): Promise<Express.Multer.File[]> => {
  const files: Express.Multer.File[] = [];

  for (let i = 0; i < metadata.length; i += batchSize) {
    const batch = metadata.slice(i, i + batchSize);
    const batchPromises = batch.map(async (fileMeta) => {
      const buffer = await fs.promises.readFile(fileMeta.fullPath);
      return {
        fieldname: 'files',
        originalname: fileMeta.relativePath,
        encoding: '7bit',
        mimetype: getMimeType(fileMeta.relativePath),
        buffer,
        size: buffer.length,
      } as Express.Multer.File;
    });

    const batchResults = await Promise.all(batchPromises);
    files.push(...batchResults);

    // Log progress for large archives
    if (metadata.length > batchSize) {
      logger.info(
        { processed: Math.min(i + batchSize, metadata.length), total: metadata.length },
        'MECA::File batch processing progress',
      );
    }
  }

  return files;
};

/**
 * Collect all files from extracted MECA directory for upload
 * Security features:
 * - Detects and skips symlinks to prevent directory traversal
 * - Validates all paths are within the extraction directory
 * - Enforces configurable total size and file count limits
 * - Processes files in batches to reduce memory pressure
 */
const collectFilesForUpload = async (
  extractedPath: string,
  options?: {
    maxTotalSize?: number;
    maxFileCount?: number;
    batchSize?: number;
  },
): Promise<Express.Multer.File[]> => {
  const { maxTotalSize, maxFileCount, batchSize } = options || {};

  // First pass: collect metadata and validate paths/sizes without reading content
  const fileMetadata = await collectFileMetadata(extractedPath, maxTotalSize, maxFileCount);

  // Second pass: read files in batches
  return readFilesInBatches(fileMetadata, batchSize);
};

/**
 * Get MIME type based on file extension
 */
const getMimeType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xml': 'application/xml',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.eps': 'application/postscript',
    '.bib': 'application/x-bibtex',
    '.toml': 'application/toml',
    '.cxx': 'text/x-c',
    '.cpp': 'text/x-c++',
    '.h': 'text/x-c',
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

type MecaImportRequest = ValidatedRequest<typeof mecaImportSchema, AuthenticatedRequestWithNode>;

/**
 * Import a MECA (Manuscript Exchange Common Approach) archive
 *
 * This endpoint accepts a .meca.zip file, extracts it, parses the myst.yml for metadata,
 * updates the node's manifest, and uploads all files to the node's drive.
 */
export const mecaImport = async (req: MecaImportRequest, res: Response, _next: NextFunction) => {
  const { uuid } = req.validatedData.params;
  const { dryRun } = req.validatedData.body;
  const user = req.user;
  const isDesciUser = user.email?.endsWith('@desci.com') ?? false;

  // Check for uploaded file
  const file = req.file as Express.Multer.File;
  if (!file) {
    return sendError(res, 'MECA zip file is required', 400);
  }

  // Validate file type
  if (!file.originalname.endsWith('.meca.zip') && !file.originalname.endsWith('.zip')) {
    return sendError(res, 'Invalid file type. Expected .meca.zip file', 400);
  }

  const node = await getNodeByUuid(uuid);
  if (!node || !node.manifestDocumentId) {
    return sendError(res, 'Node not initialized', 404);
  }

  await saveInteraction({
    req,
    userId: user.id,
    action: ActionType.USER_ACTION,
    data: { action: AvailableUserActionLogTypes.actionImportMystRepo, uuid, dryRun, source: 'meca' },
  });

  // Create unique extraction path
  const extractionId = `${user.id}_${Date.now()}`;
  const zipPath = path.join(TEMP_MECA_PATH, `${extractionId}.zip`);
  const extractedPath = path.join(TEMP_MECA_PATH, extractionId);

  try {
    // Ensure temp directory exists
    await fs.promises.mkdir(TEMP_MECA_PATH, { recursive: true });

    // Save uploaded zip to disk
    await fs.promises.writeFile(zipPath, file.buffer);
    logger.info({ zipPath, extractedPath }, 'MECA::Saved zip file to disk');

    // Extract zip file
    await fs.promises.mkdir(extractedPath, { recursive: true });
    await extractZipFileAndCleanup(zipPath, extractedPath);
    logger.info({ extractedPath }, 'MECA::Extracted zip file');

    // Find and parse myst.yml from bundle directory
    const mystYamlPath = path.join(extractedPath, 'bundle', 'myst.yml');
    const parseResult = await parseMystYaml(mystYamlPath);

    if (!parseResult.ok) {
      await rimraf(extractedPath);
      return sendError(res, parseResult.error, 400);
    }

    const parsedDocument = parseResult.data;
    const { title, authors, description, license, keywords, affiliations } = parsedDocument;

    // Build manifest actions from parsed metadata
    const actions: ManifestActions[] = [];

    if (title?.trim()) {
      actions.push({ type: 'Update Title', title });
    }

    if (description?.trim()) {
      actions.push({ type: 'Update Description', description });
    }

    if (authors?.length > 0) {
      actions.push({
        type: 'Set Contributors',
        contributors: authors.map((author, authorIndex) => {
          const organization = affiliations?.[authorIndex];
          return {
            id: uuidv4(),
            name: author.name,
            role: [],
            email: author.email,
            ...(author?.orcid && { orcid: author.orcid }),
            ...(organization && { organizations: [{ id: author.email ?? '', name: organization.name }] }),
          };
        }),
      });
    }

    if (license) {
      actions.push({ type: 'Update License', defaultLicense: license?.content?.id ?? license?.code?.id });
    }

    if (keywords?.length > 0) {
      actions.push({ type: 'Set Keywords', keywords });
    }

    // If dry run, return preview without making changes
    if (dryRun) {
      await rimraf(extractedPath);
      return sendSuccess(res, {
        ok: true,
        preview: true,
        debug: isDesciUser ? { actions, parsedDocument } : undefined,
      });
    }

    // Dispatch metadata actions to update manifest
    if (actions.length > 0) {
      const response = await repoService.dispatchAction({
        uuid,
        documentId: node.manifestDocumentId as DocumentId,
        actions,
      });

      if (!response) {
        await rimraf(extractedPath);
        return sendError(res, 'Could not update research object with MECA metadata', 500);
      }

      await saveInteraction({
        req,
        userId: user.id,
        action: ActionType.MYST_REPO_METADATA_IMPORT,
        data: { uuid, dryRun, source: 'meca' },
      });
    }

    // Collect all files from extracted MECA directory
    let filesToUpload: Express.Multer.File[];
    try {
      filesToUpload = await collectFilesForUpload(extractedPath);
      logger.info({ fileCount: filesToUpload.length }, 'MECA::Collected files for upload');
    } catch (error) {
      if (error instanceof FileCollectionError) {
        await rimraf(extractedPath);
        return sendError(res, error.message, 400);
      }
      throw error;
    }

    if (filesToUpload.length === 0) {
      await rimraf(extractedPath);
      return sendError(res, 'No files found in MECA archive', 400);
    }

    // Upload files to node drive
    const { ok, value } = await processS3DataToIpfs({
      files: filesToUpload,
      user,
      node,
      contextPath: 'root',
    });

    // Cleanup extracted files
    await rimraf(extractedPath);

    if (!ok) {
      logger.error({ error: value }, 'MECA::Failed to upload files');
      return sendError(res, 'Failed to upload MECA files to drive', 500);
    }

    await saveInteraction({
      req,
      userId: user.id,
      action: ActionType.MYST_REPO_FILES_IMPORT,
      data: { uuid, source: 'meca' },
    });

    // Pin PDF manuscripts as components
    const manuscriptFiles = value.tree[0].contains?.filter(
      (drive) => drive.componentType === ResearchObjectComponentType.PDF || drive.name.endsWith('.pdf'),
    );

    if (manuscriptFiles && manuscriptFiles.length > 0) {
      logger.info({ manuscriptFiles }, 'MECA::Found manuscript files to pin');

      const componentsToPin = manuscriptFiles.map((drive) => {
        const newComponent: ResearchObjectV1Component = {
          id: uuidv4(),
          name: drive.name,
          type: drive.componentType as ResearchObjectComponentType,
          ...(drive.componentSubtype ? { subtype: drive.componentSubtype } : {}),
          payload: {
            path: drive.path,
            cid: drive.cid,
          },
          starred: true,
        };
        return newComponent;
      });

      logger.info({ componentsToPin }, 'MECA::Components to pin');

      try {
        const pinResponse = await repoService.dispatchAction({
          uuid: node.uuid,
          documentId: node.manifestDocumentId as DocumentId,
          actions: [{ type: 'Add Components', components: componentsToPin }] as ManifestActions[],
        });

        if (!pinResponse) {
          //   throw new Error('dispatchAction returned empty response');
          await saveInteraction({
            req,
            userId: user.id,
            action: ActionType.MYST_REPO_JOB_FAILED,
            data: {
              uuid: node.uuid,
              message: 'Failed to pin components: dispatchAction returned empty response',
            },
          });
        }
      } catch (pinError) {
        const pinErrorMsg = pinError instanceof Error ? pinError.message : String(pinError);
        logger.error(
          {
            error: pinError,
            stack: pinError instanceof Error ? pinError.stack : undefined,
            uuid: node.uuid,
            manifestDocumentId: node.manifestDocumentId,
            componentsToPin,
          },
          'MECA::Failed to pin components',
        );

        // Cleanup on pin failure
        try {
          if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath);
          if (fs.existsSync(extractedPath)) await rimraf(extractedPath);
        } catch (cleanupError) {
          logger.error({ cleanupError }, 'MECA::Cleanup error during pin failure');
        }

        await saveInteraction({
          req,
          userId: user.id,
          action: ActionType.MYST_REPO_JOB_FAILED,
          data: { uuid: node.uuid, message: `Failed to pin components: ${pinErrorMsg}` },
        });

        return sendError(res, `Failed to pin manuscript components: ${pinErrorMsg}`, 500);
      }
    }

    await saveInteraction({
      req,
      userId: user.id,
      action: ActionType.MYST_REPO_JOB_COMPLETED,
      data: { uuid, source: 'meca' },
    });

    return sendSuccess(res, {
      ok: true,
      filesUploaded: filesToUpload.length,
      debug: isDesciUser ? { actions, parsedDocument, uploadResult: value } : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error({ error, stack: error instanceof Error ? error.stack : undefined }, 'MECA::Import error');

    // Cleanup on error
    try {
      if (fs.existsSync(zipPath)) await fs.promises.unlink(zipPath);
      if (fs.existsSync(extractedPath)) await rimraf(extractedPath);
    } catch (cleanupError) {
      logger.error({ cleanupError }, 'MECA::Cleanup error');
    }

    await saveInteraction({
      req,
      userId: user.id,
      action: ActionType.MYST_REPO_JOB_FAILED,
      data: { uuid, source: 'meca', message: msg || 'Import failed' },
    });

    return sendError(res, msg || 'Failed to import MECA archive', 500);
  }
};
