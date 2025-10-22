import { DocumentId } from '@automerge/automerge-repo';
import { projectFrontmatterSchema } from '@awesome-myst/myst-zod';
import {
  AvailableUserActionLogTypes,
  ManifestActions,
  ResearchObjectComponentType,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import { ActionType, ImportTaskQueueStatus } from '@prisma/client';
import axios from 'axios';
import { NextFunction, Response } from 'express';
import { load } from 'js-yaml';
import { err, ok, Result } from 'neverthrow';
import { errWithCause } from 'pino-std-serializers';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../core/api.js';
import { UnProcessableRequestError } from '../../core/ApiError.js';
import { AuthenticatedRequestWithNode, RequestWithJob, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { processS3DataToIpfs } from '../../services/data/processing.js';
import { importTaskService } from '../../services/index.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { getNodeByUuid } from '../../services/node.js';
import repoService from '../../services/repoService.js';

const logger = parentLogger.child({
  module: 'NODE::githubMystImport',
});

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
    if (!matchList) {
      return err(new UnProcessableRequestError('Invalid github URL'));
    }

    const [, author, repo, branch, contentPath] = matchList as RegExpMatchArray;

    const baseDownloadUrl = `https://raw.githubusercontent.com/${author}/${repo}/${branch ? branch + '/' : ''}`;
    const rawDownloadUrl = `${baseDownloadUrl}${contentPath}`;

    return ok({ baseDownloadUrl, rawDownloadUrl });
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to parse github URL', error));
  }
};

const downloadFileFromUrl = async (rawDownloadUrl: string) => {
  try {
    const apiResponse = await axios(rawDownloadUrl, {
      responseType: 'text',
      validateStatus: () => true,
    });

    if (apiResponse.status !== 200) {
      return err(new UnProcessableRequestError('File not found'));
    }

    const rawFile = await apiResponse.data;

    return ok(rawFile);
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to download file', error));
  }
};

const downloadManuscriptFromUrl = async (
  rawDownloadUrl: string,
): Promise<Result<Buffer, UnProcessableRequestError>> => {
  try {
    const apiResponse = await axios(rawDownloadUrl, {
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });

    if (apiResponse.status !== 200) {
      return err(new UnProcessableRequestError('File not found'));
    }

    const rawFile = Buffer.from(apiResponse.data);

    return ok(rawFile);
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to download file', error));
  }
};

const parseMystDocument = async (
  yamlText: string,
): Promise<Result<z.infer<typeof projectFrontmatterSchema>, UnProcessableRequestError>> => {
  try {
    const parsedYaml = load(yamlText, { json: true }) as Record<string, unknown>;

    const parsedProject = projectFrontmatterSchema.safeParse(parsedYaml['project']);
    if (parsedProject.error) {
      return err(new UnProcessableRequestError('yaml file validation failed!'));
    }
    // logger.trace({ parsedProject: parsedProject.data }, 'MYST::parsedProject');

    const parsed = mystYamlSchema.safeParse(parsedYaml);
    if (parsed.error) {
      return err(new UnProcessableRequestError('yaml file validation failed!'));
    }

    if (!parsedYaml['project']) {
      return err(new UnProcessableRequestError('Missing project metadata!'));
    }

    return ok({ ...parsedProject.data, authors: parsed.data.project.authors });
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to fetch/parse MyST YAML', error));
  }
};

export type MystImportJob = {
  uuid: string;
  url: string;
  userId: number;
  status: ImportTaskQueueStatus;
  message: string;
};

type GithubMystImportRequest = ValidatedRequest<typeof githubMystImportSchema, AuthenticatedRequestWithNode>;

export const githubMystImport = async (req: GithubMystImportRequest, res: Response, _next: NextFunction) => {
  const { uuid } = req.validatedData.params;
  const { url, dryRun } = req.validatedData.body;

  const isDesciUser = req.user.email.endsWith('@desci.com');

  const node = await getNodeByUuid(uuid);
  if (!node || !node.manifestDocumentId) {
    return sendError(res, 'Node not initialized', 404);
  }

  const parseUrlResult = parseImportUrl(url);
  if (parseUrlResult.isErr()) {
    return err(parseUrlResult.error);
  }

  const { rawDownloadUrl } = parseUrlResult.value;

  await saveInteraction({
    req,
    userId: req.user.id,
    action: ActionType.USER_ACTION,
    data: { action: AvailableUserActionLogTypes.actionImportMystRepo, url, uuid, dryRun },
  });

  const downloadFileResult = await downloadFileFromUrl(rawDownloadUrl);
  if (downloadFileResult.isErr()) {
    return err(downloadFileResult.error);
  }

  const yamlText = downloadFileResult.value;

  const parsedDocument = await parseMystDocument(yamlText);
  if (parsedDocument.isErr()) {
    return sendError(res, parsedDocument.error.message, 400);
  }

  const { title, authors, description, license, keywords, affiliations } = parsedDocument.value;

  const actions: ManifestActions[] = [];

  if (title.trim()) actions.push({ type: 'Update Title', title });

  if (description.trim()) actions.push({ type: 'Update Description', description });

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

  // in projectFrontmatterSchema, license is an object with content and code properties
  if (license) actions.push({ type: 'Update License', defaultLicense: license?.content?.id ?? license?.code?.id });

  if (keywords?.length > 0) actions.push({ type: 'Set Keywords', keywords });

  if (dryRun) {
    return sendSuccess(res, {
      ok: true,
      debug: isDesciUser ? { actions, parsedDocument } : undefined,
    });
  }

  // let manuscriptImport: { ok: boolean; value: UpdateResponse } | undefined;
  if (actions.length > 0) {
    const response = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });

    if (!response) {
      return sendError(res, 'Could not update research object with yaml metadata', 500);
    }

    await saveInteraction({
      req,
      userId: req.user.id,
      action: ActionType.MYST_REPO_METADATA_IMPORT,
      data: { url, uuid, dryRun },
    });

    const jobId = `myst-import-${uuidv4()}`;

    try {
      // Cancel any existing active tasks for this node
      const cancelResult = await importTaskService.cancelActiveTasksForNode(uuid);
      if (cancelResult.cancelled > 0) {
        logger.info({ uuid, cancelled: cancelResult.cancelled }, 'Cancelled existing active import tasks');
      }

      // Create import task in the database
      await importTaskService.createImportTask({
        jobId,
        uuid,
        url,
        status: ImportTaskQueueStatus.PENDING,
        attempts: 0,
        userId: req.user.id,
        parsedDocument: parsedDocument.value,
      });

      await saveInteraction({
        req,
        userId: req.user.id,
        action: ActionType.MYST_REPO_JOB_SCHEDULED,
        data: { jobId, url, uuid: req.node.uuid },
      });

      logger.trace({ jobId, uuid, url, userId: req.user.id }, '[githubMystImport]::JobScheduled');

      return sendSuccess(res, {
        jobId,
        debug: isDesciUser ? { actions, parsedDocument, response } : undefined,
      });
    } catch (error) {
      logger.error({ error }, 'MYST::JobScheduleError');
      return sendError(res, error.message || 'Failed to schedule job', 500);
    }
  } else {
    logger.error('NO DATA EXTRACTED');
    return sendError(res, 'Unable to extract metadata from myst YAML file', 422);
  }
};

type ImportRequestWithJob = RequestWithJob<
  ValidatedRequest<typeof githubMystImportSchema, AuthenticatedRequestWithNode>
>;

const getMystImportJobMessage = (status: ImportTaskQueueStatus) => {
  switch (status) {
    case ImportTaskQueueStatus.PENDING:
      return 'Github import job queued for processing';
    case ImportTaskQueueStatus.IN_PROGRESS:
      return 'Github import job is processing';
    case ImportTaskQueueStatus.COMPLETED:
      return 'Github import job completed';
    case ImportTaskQueueStatus.FAILED:
      return 'Github import job failed';
    default:
      return 'Github import job is pending';
  }
};

export const getMystImportJobStatusByJobId = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };

  try {
    // Get job from database
    const dbTask = await importTaskService.getTaskByJobId(jobId);
    if (!dbTask) {
      return sendError(res, 'Job not found', 404);
    }

    // Convert database task to job format for compatibility
    const job = {
      uuid: dbTask.nodeUuid,
      url: dbTask.url,
      status: dbTask.status.toLowerCase(),
      message: getMystImportJobMessage(dbTask.status),
      attempts: dbTask.attempts,
    };

    return sendSuccess(res, job);
  } catch (error) {
    logger.error({ error, jobId }, 'Error getting job status');
    return sendError(res, 'Failed to get job status', 500);
  }
};

export const cancelMystImportJob = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const job = req.job;

  try {
    // Update database task status
    await importTaskService.deleteTask(jobId);

    await saveInteraction({
      req,
      userId: req.user.id,
      action: ActionType.MYST_REPO_JOB_CANCELLED,
      data: { jobId, url: job.url, uuid: req.node.uuid },
    });

    return sendSuccess(res, { ok: true });
  } catch (error) {
    logger.error({ error, jobId }, 'Error cancelling job');
    return sendError(res, 'Failed to cancel job', 500);
  }
};

export const updateMystImportJobStatus = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const { status, message } = req.body as { status: ImportTaskQueueStatus; message: string };
  const job = req.job;

  try {
    logger.trace({ jobId, status, message }, 'MYST::updateJobStatus');

    // Update database task status
    await importTaskService.updateTaskStatus(jobId, status as ImportTaskQueueStatus);

    // Handle completion and cleanup
    if (status === ImportTaskQueueStatus.COMPLETED) {
      logger.info({ jobId }, 'MYST::Import task completed successfully');

      // Mark task as completed in database
      await importTaskService.markTaskCompleted(jobId);

      // Log completion interaction
      await saveInteraction({
        req,
        userId: req.user.id,
        action: ActionType.MYST_REPO_JOB_COMPLETED,
        data: { jobId, url: job.url, uuid: req.node.uuid },
      });
    } else if (status === ImportTaskQueueStatus.FAILED) {
      logger.error({ jobId, message }, 'MYST::Import task failed');

      // Log failure interaction
      await saveInteraction({
        req,
        userId: req.user.id,
        action: ActionType.MYST_REPO_JOB_FAILED,
        data: { jobId, url: job.url, uuid: req.node.uuid, message },
      });
    }

    return sendSuccess(res, { ok: true });
  } catch (error) {
    logger.error({ error, jobId }, 'Error updating job status');
    return sendError(res, 'Failed to update job status', 500);
  }
};

export const processMystImportFiles = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const job = req.job;
  try {
    const files = (req.files as any[]) ?? [];
    logger.trace({ jobId }, 'MYST::FilesReceived');

    if (job.status === ImportTaskQueueStatus.FAILED) {
      return sendError(res, 'Job failed', 400);
    }

    if (files.length) {
      const user = req.user;
      const node = req.node;

      await saveInteraction({
        req,
        userId: user.id,
        action: ActionType.MYST_REPO_FILES_IMPORT,
        data: { url: job.url, uuid: node.uuid },
      });

      // send files to reuseable update drive file upload service
      const { ok, value } = await processS3DataToIpfs({
        files,
        user: user,
        node: node,
        contextPath: 'root',
      });

      // Update database task status based on result
      if (ok) {
        await importTaskService.updateTaskStatus(jobId, 'COMPLETED');
      } else {
        await importTaskService.updateTaskWithError(jobId, 'Failed to import files to drive');
      }

      sendSuccess(res, { ok: true });

      await saveInteraction({
        req,
        userId: user.id,
        action: ActionType.MYST_REPO_JOB_COMPLETED,
        data: { url: job.url, uuid: node.uuid },
      });

      if (ok) {
        const manuscriptsFiles = value.tree[0].contains?.filter(
          (drive) => drive.componentType === ResearchObjectComponentType.PDF || drive.name.endsWith('.pdf'),
        );
        logger.info({ manuscriptsFiles }, '[MANUSCRIPT FILES]');
        if (!manuscriptsFiles || manuscriptsFiles.length === 0) return void 0;

        const componentsToPin = manuscriptsFiles?.map((drive) => {
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
        logger.info({ componentsToPin }, '[COMPONENTS TO PIN]');

        await repoService.dispatchAction({
          uuid: node.uuid,
          documentId: node.manifestDocumentId as DocumentId,
          actions: [{ type: 'Add Components', components: componentsToPin }] as ManifestActions[],
        });
      }
      return void 0;
    } else {
      await importTaskService.updateTaskWithError(jobId, 'No files received');
      return sendError(res, 'No files received', 400);
    }
  } catch (err) {
    logger.error({ error: errWithCause(err) }, '[PROCESS FILES ERROR]');
    await importTaskService.updateTaskWithError(jobId, err.message || 'Could not process files');
    await saveInteraction({
      req,
      userId: req.user.id,
      action: ActionType.MYST_REPO_JOB_FAILED,
      data: { jobId: jobId, uuid: req.node.uuid, message: err.message || 'Could not process files' },
    });
    return void 0;
  }
};

/**
 * Get active import tasks for a node (pending, in-progress, or failed)
 */
export const getActiveMystImportTasks = async (
  req: AuthenticatedRequestWithNode,
  res: Response,
  _next: NextFunction,
) => {
  const { uuid } = req.params as { uuid: string };

  try {
    logger.info({ uuid }, 'Getting active import tasks for node');

    const activeTask = await importTaskService.getActiveTasksForNode(uuid);

    if (!activeTask) {
      return sendSuccess(res, null);
    }

    const tasks = {
      jobId: activeTask.jobId,
      uuid: activeTask.nodeUuid,
      url: activeTask.url,
      status: activeTask.status.toLowerCase(),
      attempts: activeTask.attempts,
      message: getMystImportJobMessage(activeTask.status),
    };

    return sendSuccess(res, tasks);
  } catch (error) {
    logger.error({ error, uuid }, 'Error getting active import tasks');
    return sendError(res, 'Failed to get active import tasks', 500);
  }
};

/**
 * Retry a specific failed import task
 */
export const retryMystImportTask = async (req: AuthenticatedRequestWithNode, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };

  try {
    logger.info({ jobId }, 'Retrying import task');

    const retriedTask = await importTaskService.retryTask(jobId);

    await saveInteraction({
      req,
      userId: req.user.id,
      action: ActionType.MYST_REPO_JOB_SCHEDULED,
      data: { jobId, url: retriedTask.url, uuid: retriedTask.nodeUuid },
    });

    return sendSuccess(res, {
      jobId: retriedTask.jobId,
      uuid: retriedTask.nodeUuid,
      url: retriedTask.url,
      status: retriedTask.status.toLowerCase(),
      attempts: retriedTask.attempts,
      message: getMystImportJobMessage(retriedTask.status),
    });
  } catch (error) {
    logger.error({ error, jobId }, 'Error retrying import task');
    return sendError(res, error.message || 'Failed to retry task', 400);
  }
};
