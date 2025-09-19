import { type ProjectFrontmatter } from '@awesome-myst/myst-zod';
import { z } from 'zod';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import FormData from 'form-data';
import { rimraf } from 'rimraf';

import { logger } from '../../logger.js';
import type { Request, Response } from 'express';
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

export const TEMP_REPO_ZIP_PATH = path.join(process.cwd(), 'tmp');

const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET;
const DESCI_SERVER_URL = process.env.DESCI_SERVER_URL || 'http://host.docker.internal:5420';

if (!INTERNAL_SERVICE_SECRET || !DESCI_SERVER_URL)
  throw new Error('INTERNAL_SERVICE_SECRET or DESCI_SERVER_URL is not set');

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

const updateJobStatus = async ({
  jobId,
  message,
  status,
  uuid,
}: {
  jobId: string;
  status: string;
  message: string;
  uuid: string;
}) => {
  try {
    await axios.post(
      `${DESCI_SERVER_URL}/v1/nodes/${uuid}/github-myst-import/${jobId}/updateStatus`,
      {
        status,
        message,
      },
      {
        headers: {
          'X-Internal-Secret': `${INTERNAL_SERVICE_SECRET}`,
        },
      },
    );
  } catch (error) {
    logger.error({ error }, 'MYST::updateJobStatusError');
  }
};
export const buildAndExportMystRepo = async (req: Request, res: Response) => {
  const { url, jobId, uuid, parsedDocument } = req.body as {
    url: string;
    jobId: string;
    uuid: string;
    parsedDocument: ProjectFrontmatter;
  };

  logger.debug({ jobId, uuid, url }, 'MYST::buildAndExportMystRepo');

  if (!url || !parsedDocument || !jobId || !uuid) {
    return sendError(res, 'URL, parsedDocument, jobId and uuid are required', 400);
  }

  const parseImportUrlResult = parseMystImportGithubUrl(url);
  if (parseImportUrlResult.isErr()) {
    return sendError(res, parseImportUrlResult.error.message, 400);
  }

  sendSuccess(res, { status: 'processing', jobId, uuid });

  await updateJobStatus({
    jobId,
    uuid,
    status: 'processing',
    message: 'Downloading repo files...',
  });

  const { archiveDownloadUrl, repo, branch } = parseImportUrlResult.value;

  const zipStream = await zipUrlToStream(archiveDownloadUrl);
  const zipPath = TEMP_REPO_ZIP_PATH + '/' + repo + '-' + branch + '-' + Date.now() + '.zip';

  await fs.mkdir(zipPath.replace('.zip', ''), { recursive: true });
  await saveZipStreamToDisk(zipStream, zipPath);
  const totalSize = await calculateTotalZipUncompressedSize(zipPath);
  const externalUrlTotalSizeBytes = totalSize;
  await extractZipFileAndCleanup(zipPath, TEMP_REPO_ZIP_PATH);
  const savedFolderPath = `${TEMP_REPO_ZIP_PATH}/${repo}${branch ? '-' + branch : ''}`;

  let buildProcessResult = null;
  try {
    await updateJobStatus({
      jobId,
      uuid,
      status: 'processing',
      message: 'Building the repo files...',
    });

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
          reject(code);
        }
      });
    });
  } catch (error) {
    logger.error({ error }, 'MYST::buildProcessError');
    buildProcessResult = error;
  }

  logger.info({ totalSize, externalUrlTotalSizeBytes, buildProcessResult }, 'MYST::totalSize');

  if (buildProcessResult !== 0) {
    await updateJobStatus({
      jobId,
      uuid,
      status: 'failed',
      message: 'Failed to build the repo files',
    });

    return void 0;
  }

  // Cleanup
  await rimraf(zipPath.replace('.zip', ''));

  try {
    // extract manuscript.meca.zip folder
    const mecaExport = parsedDocument.exports.find((entry) => entry.format === 'meca');
    const manuscriptMecaZipPath = path.join(savedFolderPath, mecaExport?.output);
    await extractZipFileAndCleanup(manuscriptMecaZipPath, manuscriptMecaZipPath.replace('.zip', ''));

    const manuscriptExport = parsedDocument.exports.find((entry) => entry.format === 'pdf');
    const pdfExport = parsedDocument.exports.find((entry) => entry.format === 'typst');

    const manuscriptExportPath = manuscriptExport ? path.join(savedFolderPath, manuscriptExport?.output) : null;
    const pdfExportPath = pdfExport ? path.join(savedFolderPath, pdfExport?.output) : null;
    const mecaExportPath = mecaExport ? path.join(savedFolderPath, mecaExport?.output.replace('.zip', '')) : null;
    const pageContentPath = mecaExport ? path.join(savedFolderPath, '_build/site/content/index.json') : null;

    await updateJobStatus({
      jobId,
      uuid,
      status: 'processing',
      message: 'Exporting files...',
    });

    const formData = new FormData();

    const sendFolderContent = async (folder: fsSync.Dirent[], folderPath: string) => {
      try {
        for (const file of folder) {
          if (file.isDirectory()) {
            logger.info({ path: path.join(folderPath, file.name) }, 'read dir');
            const folder = await fs.readdir(path.join(folderPath, file.name), { withFileTypes: true });
            sendFolderContent(folder, path.join(folderPath, file.name));
          } else {
            formData.append('files', fsSync.readFileSync(path.join(folderPath, file.name)), {
              filename: file.name,
              filepath: path.join(folderPath.replace(savedFolderPath, ''), file.name),
            });
          }
        }
      } catch (error) {
        logger.error({ error }, 'MYST::sendFolderContentError');
      }
    };

    if (manuscriptExportPath) {
      formData.append('files', fsSync.readFileSync(manuscriptExportPath), manuscriptExportPath.split('/').pop());
    }
    if (pdfExportPath) {
      formData.append('files', fsSync.readFileSync(pdfExportPath), pdfExportPath.split('/').pop());
    }
    if (mecaExportPath) {
      const folder = await fs.readdir(mecaExportPath, { withFileTypes: true });
      await sendFolderContent(folder, mecaExportPath);
    }

    if (pageContentPath) {
      formData.append('files', fsSync.readFileSync(pageContentPath), pageContentPath.split('/').pop());
    }

    await axios.post(`${DESCI_SERVER_URL}/v1/nodes/${uuid}/finalize-myst-import/${jobId}/receiveFiles`, formData, {
      headers: {
        ...formData.getHeaders(),
        'X-Internal-Secret': INTERNAL_SERVICE_SECRET,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, 'MYST::receiveFilesError');
    await updateJobStatus({
      jobId,
      uuid,
      status: 'failed',
      message: error.message || 'Failed to export files',
    });
  } finally {
    // Cleanup unzipped repo folder
    await rimraf(savedFolderPath);
    return void 0;
  }
};
