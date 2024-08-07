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
import { z } from 'zod';

import {
  BadRequestError,
  NotFoundError,
  RequestWithNode,
  SuccessResponse,
  crossRefClient,
  getLatestManifestFromNode,
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
      // doi = grobidMetadata.doi;
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
        pdfUrl: '',
        keywords: [],
      };
    }

    logger.info({ grobidMetadata }, 'Grobid Metadata');
  }

  // todo: pull metadata from crossrefClient#getDoiMetadata
  // const doiMetadata = await crossRefClient.getDoiMetadata('');
  // attempt to pull doi from crossref api
  if (!doi && metadata?.title) {
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
          // ...(metadata?.keywords && {
          //   keywords: component.payload?.keywords
          //     ? component?.payload.keywords.concat(metadata.keywords)
          //     : metadata.keywords,
          // }),
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
    actions.push({ type: 'Update Title', title });

    // update contributors if populated
    if (authors.length > 0) {
      actions.push({
        type: 'Add Contributors',
        contributors: authors.map((author) => ({
          name: author.name,
          role: ResearchObjectV1AuthorRole.AUTHOR,
          ...(author.affiliations.length > 0 && { organizations: author.affiliations }),
          ...(author.orcid && { orcid: getOrcidFromURL(author.orcid) }),
        })),
      });
    }
  }

  logger.info({ actions }, 'Automate DOI actions');

  const response = await repoService.dispatchAction({
    uuid,
    documentId: node.manifestDocumentId as DocumentId,
    actions,
  });

  logger.info({ response: response.manifest.components[componentIndex] }, 'component updated');

  new SuccessResponse(true).send(res);
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
