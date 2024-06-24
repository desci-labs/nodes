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
  logger as parentLogger,
} from '../../internal.js';
import { MetadataResponse } from '../../services/AutomatedMetadata.js';
import { Work, WorkSelectOptions } from '../../services/crossRef/definitions.js';
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

  if (componentIndex === -1) throw new BadRequestError('Component to attach DOI not a valid pdf');

  const component = latestManifest.components[componentIndex] as PdfComponent;

  if (component.payload.doi) throw new ForbiddenError(`${component.subtype || component.type} already has a DOI`);

  const queryTitle =
    component.payload.path.split('/').pop().replace(/\.pdf/g, '') ||
    component.name.replace(/\.pdf/g, '') ||
    component.payload.title;

  const works = await crossRefClient.listWorks({
    queryTitle,
    rows: 5,
    select: [WorkSelectOptions.DOI, WorkSelectOptions.TITLE, WorkSelectOptions.AUTHOR],
  });

  logger.info({ works }, 'Works Response');

  const doi = works?.data?.message?.items.find((item) =>
    item.title.some((t) => t.toLowerCase() === queryTitle.toLowerCase()),
  );

  logger.info({ doi, queryTitle }, 'DOI Response');

  if (!(doi && works.ok)) {
    logger.info({ data: works?.data?.message?.items }, 'DOI Not Found');
    throw new NotFoundError('DOI not found');
  }

  // todo: pull metadata from crossrefClient#getDoiMetadata

  const actions: ManifestActions[] = [
    {
      type: 'Update Component',
      component: {
        ...component,
        payload: {
          ...component.payload,
          doi: component.payload?.doi ? component.payload.doi.concat([doi.DOI]) : [doi.DOI],
        } as PdfComponentPayload,
      },
      componentIndex,
    },
  ];

  if (prepublication) {
    const { title, authors } = transformWorkToMetadata(doi);
    actions.push({ type: 'Update Title', title });
    if (authors.length > 0) {
      actions.push({
        type: 'Add Contributors',
        contributors: authors.map((author) => ({
          name: author.name,
          role: ResearchObjectV1AuthorRole.AUTHOR,
          ...(author.affiliations.length > 0 && { organizations: author.affiliations }),
          ...(author.orcid && { orcid: author.orcid }),
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

const formatOrcidUrl = (orcid: string) => {
  const url = new URL(orcid);
  return url.pathname.replace('/', '');
};

const transformWorkToMetadata = (work: Work): MetadataResponse => {
  const title = work.title[0];
  const authors = work.author.map((author) => ({
    orcid: author.ORCID ? formatOrcidUrl(author.ORCID) : null,
    name: author.given ? `${author.given} ${author.family}`.trim() : author.name,
    affiliations: author.affiliation.map((org) => ({ name: org.name, id: '' })),
  }));

  return { title, authors, pdfUrl: '', keywords: [] };
};
