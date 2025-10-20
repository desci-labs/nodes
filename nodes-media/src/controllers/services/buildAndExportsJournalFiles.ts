import { type ProjectFrontmatter } from '@awesome-myst/myst-zod';
import { z } from 'zod';
import { Worker } from 'worker_threads';
import path from 'path';

import { logger } from '../../logger.js';
import type { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../core/api.js';

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

// Worker thread will handle all the heavy processing

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

  // Send immediate response
  sendSuccess(res, { jobId, uuid, message: 'Job queued for processing' });

  try {
    // Spawn worker thread to handle the heavy processing
    // ALWAYS use .js extension (worker must be pre-compiled even in dev)
    const workerPath = path.join(process.cwd(), 'src/workers/mystBuildWorker.ts'); // new URL('../../workers/mystBuildWorker.ts', import.meta.url);
    logger.info(
      {
        // workerPath: workerPath.href,
        workerPath,
        import: import.meta.url,
        cwd: process.cwd(),
        filePath: path.join(process.cwd(), 'src/workers/mystBuildWorker.js'),
      },
      'MYST::Spawning worker',
    );

    const worker = new Worker(path.join(process.cwd(), 'src/workers/mystBuildWorker.ts'), {
      execArgv: ['-r', 'ts-node/register', '--no-warnings'],
      workerData: {
        url,
        jobId,
        uuid,
        parsedDocument,
        tempRepoZipPath: TEMP_REPO_ZIP_PATH,
        internalServiceSecret: INTERNAL_SERVICE_SECRET,
        desciServerUrl: DESCI_SERVER_URL,
      },
    });

    worker.on('message', (message) => {
      if (message.success) {
        logger.info({ jobId, uuid }, 'MYST::Worker completed successfully');
      } else {
        logger.error({ jobId, uuid, error: message.error }, 'MYST::Worker failed');
      }
    });

    worker.on('error', (error) => {
      worker.terminate();
      logger.error({ jobId, uuid, error }, 'MYST::Worker error');
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        worker.terminate();
        logger.error({ jobId, uuid, code }, 'MYST::Worker exited with non-zero code');
      }
    });
  } catch (error) {
    logger.error({ error }, 'MYST::buildAndExportMystRepoError');
    // return sendError(res, error.message, 500);
  }
};
