import { DocumentId } from '@automerge/automerge-repo';
import { ManifestActions } from '@desci-labs/desci-models';
import { NextFunction, Response } from 'express';
import { load } from 'js-yaml';
import _ from 'lodash';
import { err, ok, Result } from 'neverthrow';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { sendError, sendSuccess } from '../../core/api.js';
import { UnProcessableRequestError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
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
      .regex(/^https:\/\/github\.com\/[^\/]+\/[^\/]+\/blob\/[^\/]+\/[^\/]+\.yml$/),
  }),
  query: z.object({
    dryRun: z.boolean().optional().default(false),
  }),
});
type GithubMystImportRequest = ValidatedRequest<typeof githubMystImportSchema, AuthenticatedRequest>;

const mystYamlSchema = z.object({
  version: z.number(),
  project: z
    .object({
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
      license: z.string().optional(),
      open_access: z.boolean().optional(),
      github: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      venue: z
        .object({
          title: z.string().optional(),
          url: z.string().optional(),
        })
        .optional(),
      bibliography: z.array(z.string()).optional(),
      exports: z
        .array(
          z.object({
            format: z.string().optional(),
            template: z.string().optional(),
            article_type: z.string().optional(),
            output: z.string().optional(),
          }),
        )
        .optional(),
      resources: z.array(z.string()).optional(),
      requirements: z.array(z.string()).optional(),
    })
    .optional(),
  site: z
    .object({
      title: z.string().optional(),
      logo: z.string().optional(),
      favicon: z.string().optional(),
      nav: z
        .array(
          z.object({
            title: z.string().optional(),
            url: z.string().optional(),
          }),
        )
        .optional(),
      options: z.object({
        logo_text: z.string().optional(),
        hide_title_on_index: z.boolean().optional(),
      }),
      domains: z.array(z.string()).optional(),
    })
    .optional(),
});

const parseMystDocument = async (
  url: string,
): Promise<Result<z.infer<typeof mystYamlSchema>, UnProcessableRequestError>> => {
  try {
    const matchList = url.match(/github.com[\/:]([^\/]+)\/([^\/^.]+)\/blob\/([^\/^.]+)\/(.+)/);
    logger.trace({ matchList }, 'MYST::matchList');
    if (!matchList) {
      return err(new UnProcessableRequestError('Invalid github URL'));
    }

    const [, author, repo, branchOrPath, path] = matchList as RegExpMatchArray;
    const branch = path !== undefined ? branchOrPath : undefined;
    const contentPath = branch ? path : branchOrPath;

    const rawDownloadUrl = `https://raw.githubusercontent.com/${author}/${repo}/${branch ? branch + '/' : ''}${contentPath}`;
    // const contentDownloadUrl = `https://api.github.com/repos/${author}/${repo}/contents/${contentPath}?ref=${branch}`;
    // const apiUrl = branch && contentPath ? rawDownloadUrl : contentDownloadUrl;

    logger.trace({ rawDownloadUrl }, 'MYST::apiUrl');

    const apiResponse = await fetch(rawDownloadUrl);
    if (apiResponse.status !== 200) {
      return err(new UnProcessableRequestError('File not found'));
    }

    const contentType = apiResponse.headers.get('content-type');
    logger.trace({ contentType }, 'MYST::apiResponse');

    const yamlText = await apiResponse.text();
    logger.trace({ yamlText: yamlText.slice(0, 20) }, 'MYST::githubResponse');

    const parsed = mystYamlSchema.safeParse(load(yamlText, { json: true }));
    if (parsed.error) {
      return err(new UnProcessableRequestError('yaml file validation failed!'));
    }

    logger.trace({ document: parsed.data }, 'MYST::doc');
    return ok(parsed.data);
  } catch (error) {
    return err(error as any);
  }
};

export const githubMystImport = async (req: GithubMystImportRequest, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  const { url, dryRun } = req.body;

  const isDesciUser = req.user.email.endsWith('@desci.com');

  const node = await getNodeByUuid(uuid);
  if (!node) {
    return sendError(res, 'Node not found', 404);
  }

  const parsedDocument = await parseMystDocument(url);
  if (parsedDocument.isErr()) {
    return sendError(res, parsedDocument.error.message, 400);
  }

  const { title, authors, description, license, keywords } = parsedDocument.value.project;

  const actions: ManifestActions[] = [];

  // update title
  if (title.trim()) actions.push({ type: 'Update Title', title });

  if (description.trim()) actions.push({ type: 'Update Description', description });

  // update contributors if populated
  if (authors?.length > 0) {
    actions.push({
      type: 'Set Contributors',
      contributors: authors.map((author) => ({
        id: uuidv4(),
        name: author.name,
        role: [],
        ...(author.affiliation && { organizations: [{ id: author.email ?? '', name: author.affiliation }] }),
        ...(author.orcid && { orcid: author.orcid }),
      })),
    });
  }

  if (license.trim()) actions.push({ type: 'Update License', defaultLicense: license });

  if (keywords?.length > 0) actions.push({ type: 'Update ResearchFields', researchFields: keywords });

  if (dryRun) {
    return sendSuccess(res, {
      ok: true,
      debug: isDesciUser ? { actions, parsedDocument } : undefined,
    });
  }

  if (actions.length > 0) {
    logger.trace({ actions }, 'Populate Node with myst metadata');
    const response = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });

    logger.trace({ response: response.manifest }, 'myst metadata updated');

    return sendSuccess(res, {
      ok: response.manifest !== null,
      debug: isDesciUser ? { actions, parsedDocument, response } : undefined,
    });
  } else {
    logger.error('NO DATA EXTRACTED');
    return sendError(res, 'Unable to extract metadata from manuscript', 400);
  }
};
