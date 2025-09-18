import { projectFrontmatterSchema, type ProjectFrontmatter } from '@awesome-myst/myst-zod';
import { z } from 'zod';
import { err, ok, Result } from 'neverthrow';
import axios from 'axios';
import { load } from 'js-yaml';
import * as fs from 'fs/promises';
import os from 'os';
import { rimraf } from 'rimraf';

export const TEMP_REPO_ZIP_PATH = path.join(process.cwd(), 'tmp');

import { logger } from '../../logger.js';
import type { Request, Response } from 'express';
import { UnProcessableRequestError } from '../../core/ApiError.js';
import { sendError, sendSuccess } from '../../core/api.js';
import path from 'path';
import {
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  parseMystImportGithubUrl,
  saveZipStreamToDisk,
  zipUrlToStream,
} from '../../utils.js';
import { spawn } from 'child_process';

export const githubMystImportSchema = z.object({
  params: z.object({
    uuid: z.string(),
  }),
  body: z.object({
    url: z
      .string()
      .url()
      // .regex(/^https:\/\/github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/[^\/]+\.yml$/),
      .regex(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+\.ya?ml)$/),
    dryRun: z.boolean().optional().default(false),
  }),
});

const mystYamlSchema = z.object({
  version: z.number(),
  project: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
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

const parseImportUrl = (url: string) => {
  try {
    const matchList = url.match(/github.com[\/:]([^\/]+)\/([^\/^.]+)\/blob\/([^\/^.]+)\/(.+)/);
    logger.debug({ matchList }, 'MYST::matchList');
    if (!matchList) {
      return err(new UnProcessableRequestError('Invalid github URL'));
    }

    const [, author, repo, branch, contentPath] = matchList as RegExpMatchArray;
    logger.debug({ author, repo, branch, contentPath }, 'MYST::Regex');

    const baseDownloadUrl = `https://raw.githubusercontent.com/${author}/${repo}/${branch ? branch + '/' : ''}`;
    const rawDownloadUrl = `${baseDownloadUrl}${contentPath}`;
    // const contentDownloadUrl = `https://api.github.com/repos/${author}/${repo}/contents/${contentPath}?ref=${branch}`;

    logger.debug({ rawDownloadUrl }, 'MYST::apiUrl');

    return ok({ baseDownloadUrl, rawDownloadUrl });
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to parse github URL', error));
  }
};

//   const downloadFileFromUrl = async (rawDownloadUrl: string) => {
//     try {
//       const apiResponse = await axios(rawDownloadUrl, {
//         responseType: 'text',
//         validateStatus: () => true,
//       });

//       if (apiResponse.status !== 200) {
//         return err(new UnProcessableRequestError('File not found'));
//       }

//       logger.debug({ data: apiResponse.data, contentType: apiResponse.headers['content-type'] }, 'MYST::apiResponse');

//       const rawFile = await apiResponse.data;

//       return ok(rawFile);
//     } catch (error) {
//       return err(new UnProcessableRequestError('Failed to download file', error));
//     }
//   };

//   const downloadManuscriptFromUrl = async (
//     rawDownloadUrl: string,
//   ): Promise<Result<Buffer, UnProcessableRequestError>> => {
//     try {
//       const apiResponse = await axios(rawDownloadUrl, {
//         responseType: 'arraybuffer',
//         validateStatus: () => true,
//       });

//       if (apiResponse.status !== 200) {
//         return err(new UnProcessableRequestError('File not found'));
//       }

//       logger.debug({ data: apiResponse.data, contentType: apiResponse.headers['content-type'] }, 'MYST::apiResponse');

//       const rawFile = Buffer.from(apiResponse.data);

//       return ok(rawFile);
//     } catch (error) {
//       return err(new UnProcessableRequestError('Failed to download file', error));
//     }
//   };

//   const downloadGithubRepo = async (
//     rawDownloadUrl: string,
//   ): Promise<Result<Buffer, UnProcessableRequestError>> => {
//     try {
//       const apiResponse = await axios(rawDownloadUrl, {
//         responseType: 'arraybuffer',
//         validateStatus: () => true,
//       });

//       if (apiResponse.status !== 200) {
//         return err(new UnProcessableRequestError('File not found'));
//       }

//       logger.debug({ data: apiResponse.data, contentType: apiResponse.headers['content-type'] }, 'MYST::apiResponse');

//       const rawBuffer = Buffer.from(apiResponse.data);
//       const rawFolder = await extractZipFileAndCleanup(rawBuffer, os.tmpdir());

//       // Create temp directory to store repo
//       const tmpDir = path.join(os.tmpdir(), `github-repo-${Date.now()}`);
//       await fs.mkdir(tmpDir, { recursive: true });

//       // Write downloaded repo to temp file
//       const tmpFile = path.join(tmpDir, 'repo.zip');
//       await fs.writeFile(tmpFile, rawFolder);

//       logger.debug({ tmpDir, tmpFile }, 'Created temp files for github repo');

//       return ok({ tmpDir, tmpFile });
//     } catch (error) {
//       return err(new UnProcessableRequestError('Failed to download file', error));
//     }
//   };

//   const parseMystDocument = async (
//     yamlText: string,
//   ): Promise<Result<z.infer<typeof projectFrontmatterSchema>, UnProcessableRequestError>> => {
//     try {
//       const parsedYaml = load(yamlText, { json: true }) as Record<string, unknown>;
//       logger.debug({ parsedYaml }, 'MYST::parsedYaml');

//       const parsedProject = projectFrontmatterSchema.safeParse(parsedYaml['project']);
//       if (parsedProject.error) {
//         logger.debug({ error: parsedProject.error }, 'MYST::yamlValidationFailed');
//         return err(new UnProcessableRequestError('yaml file validation failed!'));
//       }
//       // logger.debug({ parsedProject: parsedProject.data }, 'MYST::parsedProject');

//       const parsed = mystYamlSchema.safeParse(parsedYaml);
//       if (parsed.error) {
//         logger.debug({ error: parsed.error }, 'MYST::yamlValidationFailed');
//         return err(new UnProcessableRequestError('yaml file validation failed!'));
//       }

//       if (!parsedYaml['project']) {
//         logger.debug({ parsedYaml }, 'MYST::missingProjectMetadata');
//         return err(new UnProcessableRequestError('Missing project metadata!'));
//       }

//       logger.debug({ document: parsed.data }, 'MYST::doc');

//       return ok({ ...parsedProject.data, authors: parsed.data.project.authors });
//     } catch (error) {
//       return err(new UnProcessableRequestError('Failed to fetch/parse MyST YAML', error));
//     }
//   };

export const buildAndExportMystRepo = async (req: Request, res: Response) => {
  // const { url } = req.query as { url: string };
  const { url, parsedDocument } = req.body as { url: string; parsedDocument: ProjectFrontmatter };

  logger.info({ query: req.query, body: req.body }, 'MYST::buildAndExportMystRepo');

  if (!url || !parsedDocument) {
    return sendError(res, 'URL or parsedDocument is required', 400);
  }

  const parseImportUrlResult = parseMystImportGithubUrl(url);
  if (parseImportUrlResult.isErr()) {
    return sendError(res, parseImportUrlResult.error.message, 400);
  }

  const { archiveDownloadUrl, repo, branch } = parseImportUrlResult.value;
  logger.info({ archiveDownloadUrl, repo, branch }, 'MYST::archiveDownloadUrl');

  const zipStream = await zipUrlToStream(archiveDownloadUrl);
  const zipPath = TEMP_REPO_ZIP_PATH + '/' + repo + '-' + branch + '-' + Date.now() + '.zip';

  await fs.mkdir(zipPath.replace('.zip', ''), { recursive: true });
  await saveZipStreamToDisk(zipStream, zipPath);
  const totalSize = await calculateTotalZipUncompressedSize(zipPath);
  const externalUrlTotalSizeBytes = totalSize;
  await extractZipFileAndCleanup(zipPath, TEMP_REPO_ZIP_PATH);
  const savedFolderPath = `${TEMP_REPO_ZIP_PATH}/${repo}${branch ? '-' + branch : ''}`;

  logger.info({ savedFolderPath }, 'MYST::savedFolderPath');

  let buildProcessResult = null;
  try {
    // Setup monitored subprocess to run pixi build command
    const buildProcess = spawn('pixi', ['run', 'build-meca'], {
      cwd: savedFolderPath,
      stdio: 'pipe',
    });

    // Monitor process output
    buildProcess.stdout.on('data', (data) => {
      logger.debug(`build-meca stdout: ${data}`);
    });

    buildProcess.stderr.on('data', (data) => {
      logger.error(`build-meca stderr: ${data}`);
    });

    // Wait for process to complete
    buildProcessResult = await new Promise((resolve, reject) => {
      buildProcess.on('close', (code) => {
        if (code === 0) {
          logger.info('build-meca completed successfully');
          resolve(code);
        } else {
          logger.error(`build-meca failed with code ${code}`);
          reject(new Error(`build-meca failed with code ${code}`));
        }
      });
    });
  } catch (error) {
    logger.error({ error }, 'MYST::buildProcessError');
    buildProcessResult = error;
  }

  logger.info({ totalSize, externalUrlTotalSizeBytes, buildProcessResult }, 'MYST::totalSize');

  if (buildProcessResult !== 0) {
    return sendError(res, 'Failed to build the repo files', 500);
  }

  const manuscriptExport = parsedDocument.exports.find((entry) => entry.format === 'pdf');
  const pdfExport = parsedDocument.exports.find((entry) => entry.format === 'typst');
  const mecaExport = parsedDocument.exports.find((entry) => entry.format === 'meca');

  const manuscriptExportPath = path.join(savedFolderPath, manuscriptExport?.output);
  const pdfExportPath = path.join(savedFolderPath, pdfExport?.output);
  const mecaExportPath = path.join(savedFolderPath, mecaExport?.output);
  const pageContentPath = path.join(savedFolderPath, '_build/site/content/index.json');

  // Cleanup
  await rimraf(zipPath.replace('.zip', ''));

  return sendSuccess(res, { manuscriptExportPath, pdfExportPath, mecaExportPath, pageContentPath });
};
