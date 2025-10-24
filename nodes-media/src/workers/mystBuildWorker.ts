import { parentPort, workerData } from 'worker_threads';
import { type ProjectFrontmatter } from '@awesome-myst/myst-zod';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import FormData from 'form-data';
import path from 'path';
import { spawn } from 'child_process';
import { logger } from '../logger.js';
import {
  calculateTotalZipUncompressedSize,
  extractZipFileAndCleanup,
  parseMystImportGithubUrl,
  saveZipStreamToDisk,
  zipUrlToStream,
} from '../utils.js';

interface WorkerData {
  url: string;
  jobId: string;
  uuid: string;
  parsedDocument: ProjectFrontmatter;
  tempRepoZipPath: string;
  internalServiceSecret: string;
  desciServerUrl: string;
}

export const updateJobStatus = async ({
  jobId,
  message,
  status,
  uuid,
  desciServerUrl,
  internalServiceSecret,
}: {
  jobId: string;
  status: string;
  message: string;
  uuid: string;
  desciServerUrl: string;
  internalServiceSecret: string;
}) => {
  try {
    await axios.post(
      `${desciServerUrl}/v1/nodes/${uuid}/github-myst-import/${jobId}/updateStatus`,
      {
        status,
        message,
      },
      {
        headers: {
          'X-Internal-Secret': `${internalServiceSecret}`,
        },
      },
    );
  } catch (error) {
    logger.error({ error }, 'MYST::updateJobStatusError');
  }
};

const cleanup = async (path: string) => {
  if (!path) return;
  try {
    logger.info({ path }, 'MYST::cleanup::removing path');
    await fs.rm(path, { recursive: true, force: true });
  } catch (error) {
    logger.error({ error }, 'MYST::cleanupError');
  }
};

const processMystBuild = async (data: WorkerData) => {
  const { url, jobId, uuid, parsedDocument, tempRepoZipPath, internalServiceSecret, desciServerUrl } = data;

  logger.debug({ uuid, url }, 'MYST::Worker::processMystBuild');

  const parseImportUrlResult = parseMystImportGithubUrl(url);
  if (parseImportUrlResult.isErr()) {
    throw new Error(parseImportUrlResult.error.message);
  }

  const { archiveDownloadUrl, repo, branch } = parseImportUrlResult.value;

  const zipPath = tempRepoZipPath + '/' + repo + '-' + branch + '-' + Date.now() + '.zip';
  let savedFolderPath = `${tempRepoZipPath}/${repo}${branch ? '-' + branch : ''}`;
  let totalSize = 0;
  let externalUrlTotalSizeBytes = 0;

  // Check if savedFolderPath already exists
  const savedFolderExists = await fs
    .access(savedFolderPath)
    .then(() => true)
    .catch(() => false);

  if (!savedFolderExists) {
    try {
      const zipStream = await zipUrlToStream(archiveDownloadUrl);
      await fs.mkdir(zipPath.replace('.zip', ''), { recursive: true });
      await saveZipStreamToDisk(zipStream, zipPath);
      totalSize = await calculateTotalZipUncompressedSize(zipPath);
      externalUrlTotalSizeBytes = totalSize;
      await extractZipFileAndCleanup(zipPath, tempRepoZipPath, true);
    } catch (error) {
      logger.error({ error }, 'MYST::Worker::saveAndExtractZipFileError');
      await updateJobStatus({
        jobId,
        uuid,
        status: 'FAILED',
        message: error.message || 'Failed to save and extract zip file',
        desciServerUrl,
        internalServiceSecret,
      });

      // Cleanup unzipped repo folder
      await cleanup(zipPath.replace('.zip', ''));
      throw error;
    }
  } else {
    logger.info({ savedFolderPath }, 'MYST::Worker::savedFolderPath already exists, skipping download and extraction');
  }

  let buildProcessResult = null;

  // Skip build process if savedFolderPath already exists
  if (!savedFolderExists) {
    try {
      logger.info({ savedFolderPath }, 'Building the repo files');
      // Setup monitored subprocess to run pixi build command
      const buildProcess = spawn('pixi', ['run', 'build-meca'], {
        cwd: savedFolderPath,
        stdio: 'pipe',
      });

      // Monitor process output
      buildProcess.stdout.on('data', (data) => {
        logger.info(`build-meca stdout: ${data}`);
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
      logger.error({ error }, 'MYST::Worker::buildProcessError');
      buildProcessResult = error;
    }
  } else {
    logger.info({ savedFolderPath }, 'MYST::Worker::savedFolderPath already exists, skipping build process');
    buildProcessResult = 0; // Set to success since we're skipping
  }

  if (buildProcessResult !== 0) {
    logger.error({ buildProcessResult }, 'MYST::Worker::buildProcessResult');
    await updateJobStatus({
      jobId,
      uuid,
      status: 'FAILED',
      message: 'Failed to build the repo files',
      desciServerUrl,
      internalServiceSecret,
    });

    await cleanup(zipPath.replace('.zip', ''));

    throw new Error('Build process failed');
  }

  logger.info({ savedFolderPath }, 'Building the repo files completed');

  // Cleanup
  await cleanup(zipPath.replace('.zip', ''));

  try {
    // extract manuscript.meca.zip folder
    const mecaExport = parsedDocument.exports.find((entry) => entry.format === 'meca');
    const manuscriptMecaZipPath = path.join(savedFolderPath, mecaExport?.output);

    // Check if manuscriptMecaZipPath already exists before extraction
    const mecaZipExists = await fs
      .access(manuscriptMecaZipPath.replace('.zip', ''))
      .then(() => true)
      .catch(() => false);

    if (!mecaZipExists) {
      await extractZipFileAndCleanup(manuscriptMecaZipPath, manuscriptMecaZipPath.replace('.zip', ''), true);
    } else {
      logger.info({ manuscriptMecaZipPath }, 'MYST::Worker::manuscriptMecaZipPath already exists, skipping extraction');
    }

    const manuscriptExport = parsedDocument.exports.find((entry) => entry.format === 'pdf');
    const pdfExport = parsedDocument.exports.find((entry) => entry.format === 'typst');

    const manuscriptExportPath = manuscriptExport ? path.join(savedFolderPath, manuscriptExport?.output) : null;
    const pdfExportPath = pdfExport ? path.join(savedFolderPath, pdfExport?.output) : null;
    const mecaExportPath = mecaExport ? path.join(savedFolderPath, mecaExport?.output.replace('.zip', '')) : null;
    const pageContentPath = mecaExport ? path.join(savedFolderPath, '_build/site/content/index.json') : null;

    const formData = new FormData();

    const sendFolderContent = async (folder: fsSync.Dirent[], folderPath: string) => {
      try {
        for (const file of folder) {
          if (file.isDirectory()) {
            const folder = await fs.readdir(path.join(folderPath, file.name), { withFileTypes: true });
            await sendFolderContent(folder, path.join(folderPath, file.name));
          } else {
            formData.append('files', fsSync.readFileSync(path.join(folderPath, file.name)), {
              filename: file.name,
              filepath: path.join(folderPath.replace(savedFolderPath, ''), file.name),
            });
          }
        }
      } catch (error) {
        logger.error({ error }, 'MYST::Worker::sendFolderContentError');
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

    formData.append('uuid', uuid);
    formData.append('contextPath', 'root');

    const response = await axios.post(
      `${desciServerUrl}/v1/nodes/${uuid}/finalize-myst-import/${jobId}/receiveFiles`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'X-Internal-Secret': internalServiceSecret,
        },
      },
    );

    if (response.status === 200) {
      await updateJobStatus({
        jobId,
        uuid,
        status: 'COMPLETED',
        message: 'Files exported successfully',
        desciServerUrl,
        internalServiceSecret,
      });
    }

    logger.info({ jobId, uuid }, 'MYST::Worker::Completed successfully');
  } catch (error) {
    logger.error({ error: error.message }, 'MYST::Worker::receiveFilesError');
    await updateJobStatus({
      jobId,
      uuid,
      status: 'FAILED',
      message: error.message || 'Failed to export files',
      desciServerUrl,
      internalServiceSecret,
    });
    await cleanup(savedFolderPath);
    throw error;
  }
};

// Worker entry point
if (parentPort) {
  const data = workerData as WorkerData;

  processMystBuild(data)
    .then(() => {
      parentPort?.postMessage({ success: true });
    })
    .catch((error) => {
      logger.error({ error }, 'MYST::Worker::Fatal error');
      parentPort?.postMessage({
        success: false,
        error: error.message || 'Unknown error',
      });
    });
}
