import { DocumentId } from '@automerge/automerge-repo';
import { projectFrontmatterSchema } from '@awesome-myst/myst-zod';
import { ManifestActions, ResearchObjectComponentType, ResearchObjectV1Component } from '@desci-labs/desci-models';
import axios from 'axios';
import { NextFunction, Response } from 'express';
import { Request } from 'express';
import { load } from 'js-yaml';
import _ from 'lodash';
import { err, ok, Result } from 'neverthrow';
import { errWithCause } from 'pino-std-serializers';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { INTERNAL_SERVICE_SECRET } from '../../config.js';
import { sendError, sendSuccess } from '../../core/api.js';
import { UnProcessableRequestError } from '../../core/ApiError.js';
import { AuthenticatedRequestWithNode, RequestWithJob, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { DEFAULT_TTL, getFromCache, setToCache } from '../../redisClient.js';
import { processS3DataToIpfs } from '../../services/data/processing.js';
import { getNodeByUuid } from '../../services/node.js';
import repoService from '../../services/repoService.js';
import { getUserById } from '../../services/user.js';

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
    // license: z
    //   .object({
    //     content: z.string().optional().describe('License for the content'),
    //     code: z.string().optional().describe('License for the code'),
    //   })
    //   .describe('Licenses for the notebook'),
    // open_access: z.boolean().optional(),
    // github: z.string().optional(),
    // keywords: z.array(z.string()).optional(),
    // venue: z
    //   .object({
    //     title: z.string().optional(),
    //     url: z.string().optional(),
    //   })
    //   .optional(),
    // bibliography: z.array(z.string()).optional(),
    // exports: z
    //   .array(
    //     z.object({
    //       format: z.string().optional(),
    //       template: z.string().optional(),
    //       article_type: z.string().optional(),
    //       output: z.string().optional(),
    //     }),
    //   )
    //   .optional(),
    // resources: z.array(z.string()).optional(),
    // requirements: z.array(z.string()).optional(),
  }),
  // site: z
  //   .object({
  //     title: z.string().optional(),
  //     logo: z.string().optional(),
  //     favicon: z.string().optional(),
  //     nav: z
  //       .array(
  //         z.object({
  //           title: z.string().optional(),
  //           url: z.string().optional(),
  //         }),
  //       )
  //       .optional(),
  //     options: z.object({
  //       logo_text: z.string().optional(),
  //       hide_title_on_index: z.boolean().optional(),
  //     }),
  //     domains: z.array(z.string()).optional(),
  //   })
  //   .optional(),
});

const parseImportUrl = (url: string) => {
  try {
    const matchList = url.match(/github.com[\/:]([^\/]+)\/([^\/^.]+)\/blob\/([^\/^.]+)\/(.+)/);
    logger.trace({ matchList }, 'MYST::matchList');
    if (!matchList) {
      return err(new UnProcessableRequestError('Invalid github URL'));
    }

    const [, author, repo, branch, contentPath] = matchList as RegExpMatchArray;
    logger.trace({ author, repo, branch, contentPath }, 'MYST::Regex');

    const baseDownloadUrl = `https://raw.githubusercontent.com/${author}/${repo}/${branch ? branch + '/' : ''}`;
    const rawDownloadUrl = `${baseDownloadUrl}${contentPath}`;
    // const contentDownloadUrl = `https://api.github.com/repos/${author}/${repo}/contents/${contentPath}?ref=${branch}`;

    logger.trace({ rawDownloadUrl }, 'MYST::apiUrl');

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

    logger.trace({ data: apiResponse.data, contentType: apiResponse.headers['content-type'] }, 'MYST::apiResponse');

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

    logger.trace({ data: apiResponse.data, contentType: apiResponse.headers['content-type'] }, 'MYST::apiResponse');

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
    logger.trace({ parsedYaml }, 'MYST::parsedYaml');

    const parsedProject = projectFrontmatterSchema.safeParse(parsedYaml['project']);
    if (parsedProject.error) {
      logger.trace({ error: parsedProject.error }, 'MYST::yamlValidationFailed');
      return err(new UnProcessableRequestError('yaml file validation failed!'));
    }
    // logger.trace({ parsedProject: parsedProject.data }, 'MYST::parsedProject');

    const parsed = mystYamlSchema.safeParse(parsedYaml);
    if (parsed.error) {
      logger.trace({ error: parsed.error }, 'MYST::yamlValidationFailed');
      return err(new UnProcessableRequestError('yaml file validation failed!'));
    }

    if (!parsedYaml['project']) {
      logger.trace({ parsedYaml }, 'MYST::missingProjectMetadata');
      return err(new UnProcessableRequestError('Missing project metadata!'));
    }

    logger.trace({ document: parsed.data }, 'MYST::doc');

    return ok({ ...parsedProject.data, authors: parsed.data.project.authors });
  } catch (error) {
    return err(new UnProcessableRequestError('Failed to fetch/parse MyST YAML', error));
  }
};

export type MystImportJob = {
  uuid: string;
  url: string;
  userId: number;
  status: MystImportJobStatus;
  message: string;
  parsedDocument: z.infer<typeof projectFrontmatterSchema>;
};

export type MystImportJobStatus = 'processing' | 'completed' | 'failed' | 'cancelled';

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
          // ...(author?.affiliation && { organizations: [{ id: author.email ?? '', name: author.affiliation }] }),
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
    logger.trace({ actions }, 'Populate Node with myst metadata');
    const response = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });

    if (!response) {
      return sendError(res, 'Could not update research object with yaml metadata', 500);
    }

    const jobId = `myst-import-${uuidv4()}`;
    const job = {
      uuid,
      url,
      userId: req.user.id,
      status: 'processing',
      message: 'Processing repo link...',
      parsedDocument: parsedDocument.value,
    };

    await setToCache(jobId, job);
    logger.trace({ jobId, uuid, url, userId: req.user.id }, 'MYST::JobCreated');

    try {
      const scheduleJobResponse = await axios.post(
        `${process.env.NODES_MEDIA_SERVER_URL}/v1/services/process-journal-submission`,
        {
          url,
          uuid,
          jobId,
          parsedDocument: parsedDocument.value,
        },
        {
          headers: {
            'X-Internal-Secret': `${INTERNAL_SERVICE_SECRET}`,
          },
        },
      );

      logger.trace({ scheduleJobResponse: scheduleJobResponse.data }, '[githubMystImport]::JobScheduled');
      return sendSuccess(res, {
        jobId,
        debug: isDesciUser ? { actions, parsedDocument, response } : undefined,
      });
    } catch (error) {
      logger.error({ error }, 'MYST::JobScheduleError');
      await setToCache(
        jobId,
        { ...job, status: 'failed', message: error.message || 'Failed to schedule job' },
        DEFAULT_TTL,
      );
      return sendError(res, error.message || 'Failed to schedule job', 500);
    }
  } else {
    logger.error('NO DATA EXTRACTED');
    return sendError(res, 'Unable to extract metadata from manuscript', 422);
  }
};

type ImportRequestWithJob = RequestWithJob<
  ValidatedRequest<typeof githubMystImportSchema, AuthenticatedRequestWithNode>
>;

export const getMystImportJobStatusByJobId = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const job = req.job;

  return sendSuccess(res, job);
};

export const cancelMystImportJob = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const job = req.job;

  await setToCache(jobId, { ...job, status: 'cancelled', message: 'Job cancelled' }, DEFAULT_TTL);
  return sendSuccess(res, job);
};

export const updateMystImportJobStatus = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  const { jobId } = req.params as { jobId: string };
  const { status, message } = req.body as { status: MystImportJobStatus; message: string };
  const job = req.job;

  logger.trace({ jobId, status, message }, 'MYST::updateJobStatus');
  const updated = { ...job, status, message };
  await setToCache(jobId, updated, DEFAULT_TTL);
  return sendSuccess(res, updated);
};

export const processMystImportFiles = async (req: ImportRequestWithJob, res: Response, _next: NextFunction) => {
  try {
    const { jobId } = req.params as { jobId: string };
    const job = req.job;

    const files = req.files as any[];
    logger.trace({ jobId }, 'MYST::FilesReceived');

    if (files.length) {
      const user = req.user; // await getUserById(job.userId);
      const node = req.node; // await getNodeByUuid(job.uuid);
      // send files to reuseable update drive file upload service
      const { ok, value } = await processS3DataToIpfs({
        files,
        user: req.user,
        node: req.node,
        contextPath: 'root',
      });

      if (ok) {
        await setToCache(
          jobId,
          { ...job, status: 'completed', message: 'Import finished successfully', value },
          DEFAULT_TTL,
        );
      } else {
        await setToCache(
          jobId,
          { ...job, status: 'failed', message: 'Failed to import files to drive.', value },
          DEFAULT_TTL,
        );
      }

      sendSuccess(res, { ok: true });

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
      await setToCache(jobId, { ...job, status: 'failed', message: 'No files received' }, DEFAULT_TTL);
      return sendError(res, 'No files received', 400);
    }
  } catch (err) {
    logger.error({ error: errWithCause(err) }, '[PROCESS FILES ERROR]');
    // return sendError(res, err.message || 'Could not process files', 422);
    return void 0;
  }
};
