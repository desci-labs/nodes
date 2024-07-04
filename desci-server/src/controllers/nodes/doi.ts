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
  ForbiddenError,
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

export interface OpenAlexWork {
  id: string;
  title: string;
  doi: string;
  open_access: {
    is_oa: boolean;
    oa_status: string;
    oa_url: string;
  };
  best_oa_location: {
    is_oa: boolean;
    pdf_url: string;
  };
  authorships: Array<{
    author_position: string;
    author: {
      id: string;
      display_name: string;
      orcid: string;
    };
    institutions: Array<{
      id: string;
      display_name: string;
      ror: string;
      country_code: string;
      type: string;
      lineage: string[];
    }>;
    countries: string[];
    is_corresponding: boolean;
    raw_author_name: string;
    raw_affiliation_strings: string[];
    affiliations: Array<{
      raw_affiliation_string: string;
      institution_ids: string[];
    }>;
  }>;
  keywords: Array<{
    id: string;
    display_name: string;
    score: number;
  }>;
  abstract_inverted_index?: { [key: string]: number[] };
}

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
    try {
      const result = await fetch(
        `https://api.openalex.org/works/doi:${doi}?select=id,title,doi,authorships,keywords,open_access,best_oa_location,abstract_inverted_index`,
        {
          headers: {
            Accept: '*/*',
            'content-type': 'application/json',
          },
        },
      );
      logger.info({ status: result.status, message: result.statusText }, 'OPEN ALEX QUERY');
      const work = (await result.json()) as OpenAlexWork;
      logger.info({ openAlexWork: work }, 'OPEN ALEX QUERY');
      metadata = transformOpenAlexWorkToMetadata(work);
    } catch (err) {
      logger.error({ err }, 'ERROR: OPEN ALEX WORK QUERY');
    }
  }

  if (!metadata) {
    // pull metadata from AM service
    metadata = await metadataClient.getResourceMetadata({
      cid: component.payload.cid,
      doi: doi || component.payload?.doi?.[0],
    });
  }

  // todo: pull metadata from crossrefClient#getDoiMetadata
  // const doiMetadata = await crossRefClient.getDoiMetadata('');

  logger.info({ metadata }, 'METADATA');
  if (!metadata) throw new NotFoundError('DOI not found!');

  const actions: ManifestActions[] = [];

  if (!doi) {
    // fallback to metadata.doi if component payload has no doi
    doi = metadata?.doi;
  }

  if (doi) {
    actions.push({
      type: 'Update Component',
      component: {
        ...component,
        payload: {
          ...component.payload,
          doi: component.payload?.doi ? component.payload.doi : [doi],
          ...(metadata?.keywords && {
            keywords: component.payload?.keywords
              ? component?.payload.keywords.concat(metadata.keywords)
              : metadata.keywords,
          }),
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

const transformOpenAlexWorkToMetadata = (work: OpenAlexWork): MetadataResponse => {
  const authors = work.authorships.map((author) => ({
    orcid: author.author?.orcid ? getOrcidFromURL(author.author.orcid) : null,
    name: author.author.display_name,
    affiliations: author?.institutions.map((org) => ({ name: org.display_name, id: org?.ror || '' })) ?? [],
  }));

  const keywords = work?.keywords.map((entry) => entry.display_name) ?? [];

  const abstract = work?.abstract_inverted_index ? transformInvertedAbstractToText(work.abstract_inverted_index) : '';

  return { title: work.title, doi: work.doi, authors, pdfUrl: '', keywords, abstract };
};

const transformInvertedAbstractToText = (abstract: OpenAlexWork['abstract_inverted_index']) => {
  const words = [];
  Object.entries(abstract).map(([word, positions]) => {
    positions.forEach((pos) => words.splice(pos, 0, word));
  });
  return words.filter(Boolean).join(' ');
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
