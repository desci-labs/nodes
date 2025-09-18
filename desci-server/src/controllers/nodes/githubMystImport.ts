import { DocumentId } from '@automerge/automerge-repo';
import { projectFrontmatterSchema } from '@awesome-myst/myst-zod';
import {
  ManifestActions,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
} from '@desci-labs/desci-models';
import { UpdateResponse } from '@elastic/elasticsearch/lib/api/types.js';
import axios from 'axios';
import { NextFunction, Response } from 'express';
import { load } from 'js-yaml';
import _ from 'lodash';
import { err, ok, Result } from 'neverthrow';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../core/api.js';
import { UnProcessableRequestError } from '../../core/ApiError.js';
import { AuthenticatedRequestWithNode, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { processExternalUrlDataToIpfs } from '../../services/data/externalUrlProcessing.js';
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
type GithubMystImportRequest = ValidatedRequest<typeof githubMystImportSchema, AuthenticatedRequestWithNode>;

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

  const { rawDownloadUrl, baseDownloadUrl } = parseUrlResult.value;

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

  let manuscriptImport: { ok: boolean; value: UpdateResponse } | undefined;
  if (actions.length > 0) {
    logger.trace({ actions }, 'Populate Node with myst metadata');
    const response = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });

    // logger.trace({ response: response.manifest }, 'myst metadata updated');

    // const exportRef = parsedDocument.value.exports.find((entry) => entry.format === 'typst' || entry.format === 'pdf');
    // if (exportRef) {
    //   const externalUrl = { path: 'manuscript.pdf', url: `${baseDownloadUrl}${exportRef.output}` };
    //   logger.trace({ exportRef, exports: parsedDocument.value.exports, externalUrl }, 'myst exportRef');
    //   const { ok, value } = await processExternalUrlDataToIpfs({
    //     user: req.user,
    //     node: req.node,
    //     externalUrl,
    //     contextPath: 'root',
    //     componentType: ResearchObjectComponentType.PDF,
    //     componentSubtype:
    //       exportRef.format === 'pdf'
    //         ? ResearchObjectComponentDocumentSubtype.MANUSCRIPT
    //         : ResearchObjectComponentDocumentSubtype.RESEARCH_ARTICLE,
    //     autoStar: true,
    //   });

    //   if (ok) {
    //     logger.trace({ manuscriptImport: ok, value: value }, 'MYST::manuscriptImport');
    //     manuscriptImport = { ok, value };
    //   }
    // }

    const buildExportsResponse = await axios.post(
      `${process.env.NODES_MEDIA_SERVER_URL}/v1/services/process-journal-submission`,
      {
        url,
        parsedDocument: parsedDocument.value,
      },
      {
        timeout: 60000,
      },
    );
    const journalSubmissionExport = buildExportsResponse.data;
    logger.trace({ buildExportsResponse: journalSubmissionExport }, 'MYST::createJournalSubmissionExportResponse');

    return sendSuccess(res, {
      ok: response.manifest !== null,
      debug: isDesciUser ? { actions, parsedDocument, response, journalSubmissionExport } : undefined,
    });
  } else {
    logger.error('NO DATA EXTRACTED');
    return sendError(res, 'Unable to extract metadata from manuscript', 400);
  }
};
