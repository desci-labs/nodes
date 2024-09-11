import { DocumentId } from '@automerge/automerge-repo';
import {
  CommonComponentPayload,
  ManifestActions,
  PdfComponent,
  PdfComponentPayload,
  ResearchObjectComponentType,
  ResearchObjectV1AuthorRole,
} from '@desci-labs/desci-models';
import { NextFunction, Response } from 'express';
import { Request } from 'express';
import _ from 'lodash';
import { z } from 'zod';

import {
  BadRequestError,
  NotFoundError,
  RequestWithNode,
  SuccessResponse,
  UnProcessableRequestError,
  crossRefClient,
  doiService,
  ensureUuidEndsWithDot,
  getLatestManifestFromNode,
  logger,
  metadataClient,
  logger as parentLogger,
} from '../../internal.js';
import { MetadataResponse } from '../../services/AutomatedMetadata.js';
import { Work, WorkSelectOptions } from '../../services/crossRef/definitions.js';
import { getOrcidFromURL } from '../../services/crossRef/utils.js';
import repoService from '../../services/repoService.js';

export const attachDoiSchema = z.object({
  body: z.object({
    uuid: z.string(),
    path: z.string().startsWith('root/', 'Invalid component path'),
  }),
});

export const automateManuscriptDoi = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid, path, prepublication } = req.body;

  const logger = parentLogger.child({
    module: 'DOI::AttachDOI',
    body: req.body,
  });

  const node = req.node;

  const latestManifest = await getLatestManifestFromNode(node);
  const componentIndex = latestManifest.components.findIndex(
    (component) =>
      component.type === ResearchObjectComponentType.PDF && (component.payload as CommonComponentPayload).path === path,
  );

  if (componentIndex === -1) {
    logger.error(
      {
        path,
        componentIndex,
        components: latestManifest.components,
        latestManifest,
      },
      'Component to attach DOI not a valid pdf',
    );
    throw new BadRequestError('Component to attach DOI not a valid pdf');
  }

  const component = latestManifest.components[componentIndex] as PdfComponent;

  let doi: string;
  let metadata: MetadataResponse;

  // if doi is present, pull from openalex
  if (component.payload?.doi) {
    doi = component.payload.doi[0];
    metadata = await metadataClient.queryDoiFromOpenAlex(doi);
  }

  let grobidMetadata: {
    authors: string[];
    title: string;
    abstract: string;
    doi: string;
  } | null;

  if (!metadata) {
    logger.info('Pull from grobid');
    // pull from grobid
    grobidMetadata = await metadataClient.queryFromGrobid(component.payload.cid);

    logger.info({ grobidMetadata }, 'GROBID METADATA');
    if (grobidMetadata?.doi) {
      logger.info({ doi }, 'DOI PARSED FROM GROBID');
      const openAlexMetadata = await metadataClient.queryDoiFromOpenAlex(grobidMetadata.doi);
      metadata = {
        ...openAlexMetadata,
        abstract: grobidMetadata.abstract || openAlexMetadata.abstract,
        title: grobidMetadata.title || openAlexMetadata.title,
      };
    } else if (grobidMetadata) {
      metadata = {
        title: grobidMetadata?.title,
        abstract: grobidMetadata?.abstract,
        authors: grobidMetadata?.authors.map((author) => ({ name: author, affiliations: [], orcid: '' })),
      };
    }

    logger.info({ grobidMetadata }, 'Grobid Metadata');
  }

  // attempt to pull doi from crossref api
  if (!doi && metadata?.title) {
    logger.info({ title: metadata.title }, 'CHECK CROSSREF FOR DOI');
    const works = await crossRefClient.listWorks({
      rows: 5,
      select: [WorkSelectOptions.DOI, WorkSelectOptions.TITLE, WorkSelectOptions.AUTHOR],
      queryTitle: metadata.title,
    });
    const work = works?.data?.message?.items.find((item) =>
      item.title.some((t) => t.toLowerCase() === metadata?.title.toLowerCase()),
    );
    if (work?.DOI) {
      doi = work.DOI;
      // logger.info({ doi, work }, 'DOI from CrossRef');

      const openAlexMetadata = await metadataClient.queryDoiFromOpenAlex(doi);
      delete openAlexMetadata.pdfUrl;
      logger.info({ openAlexMetadata }, 'openAlexMetadata METADATA');
      metadata = {
        ...openAlexMetadata,
        abstract: grobidMetadata.abstract || openAlexMetadata.abstract,
        title: grobidMetadata.title || openAlexMetadata.title,
      };
    }
  }

  logger.info({ metadata }, 'METADATA');
  if (!metadata) throw new NotFoundError('DOI not found!');

  const actions: ManifestActions[] = [];

  if (!doi && metadata?.doi) {
    // fallback to metadata.doi if component payload has no doi
    doi = metadata?.doi;
    logger.info({ doi }, 'USE DOI FROM METADATA');
  }

  if (doi) {
    actions.push({
      type: 'Update Component',
      component: {
        ...component,
        payload: {
          ...component.payload,
          doi: component.payload?.doi ? component.payload.doi : [doi],
        } as PdfComponentPayload & CommonComponentPayload,
      },
      componentIndex,
    });
  }

  if (metadata?.abstract?.trim()) {
    actions.push({
      type: 'Update Description',
      description: metadata.abstract.trim(),
    });
  }

  if (prepublication) {
    const { title, authors } = metadata;

    // update title
    if (title.trim()) actions.push({ type: 'Update Title', title });

    // update contributors if populated
    if (authors.length > 0) {
      actions.push({
        type: 'Set Contributors',
        contributors: authors.map((author) => ({
          name: author.name,
          role: ResearchObjectV1AuthorRole.AUTHOR,
          ...(author.affiliations.length > 0 && { organizations: author.affiliations }),
          ...(author.orcid && { orcid: getOrcidFromURL(author.orcid) }),
        })),
      });
    }
  }

  if (actions.length > 0) {
    logger.info({ actions }, 'Automate DOI actions');
    const response = await repoService.dispatchAction({
      uuid,
      documentId: node.manifestDocumentId as DocumentId,
      actions,
    });

    logger.info({ response: response.manifest.components[componentIndex] }, 'component updated');

    new SuccessResponse(true).send(res);
  } else {
    logger.error('NO DATA EXTRACTED');
    throw new UnProcessableRequestError('Unable to extract metadata from manuscript');
  }
};

const transformWorkToMetadata = (work: Work): MetadataResponse => {
  const title = work.title[0];
  const authors = work.author.map((author) => ({
    orcid: author.ORCID ? getOrcidFromURL(author.ORCID) : null,
    name: author.given ? `${author.given} ${author.family}`.trim() : author.name,
    affiliations: author.affiliation.map((org) => ({ name: org.name, id: '' })),
  }));

  return { title, authors, pdfUrl: '', keywords: [] };
};

export const retrieveNodeDoi = async (req: Request, res: Response, _next: NextFunction) => {
  // const { doi: doiQuery } = req.query;
  const { identifier } = req.params;
  // const identifier = (req.params.identifier || doiQuery || uuid || dpid) as string;
  logger.info({ identifier }, 'RETRIEVE NODE DOI');
  if (!identifier) throw new BadRequestError();

  if (identifier) {
    const pending = await doiService.hasPendingSubmission(ensureUuidEndsWithDot(identifier as string));
    logger.info({ pending }, 'GET DOI');
    if (pending) {
      new SuccessResponse({ status: pending.status }).send(res);
      return;
    }
  }

  const doi = await doiService.findDoiRecord(identifier as string);
  const data = _.pick(doi, ['doi', 'dpid', 'uuid']);

  new SuccessResponse(data).send(res);
};
