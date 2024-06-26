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

  // if (component.payload.doi) throw new ForbiddenError(`${component.subtype || component.type} already has a DOI`);

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

  const matchFound = works?.data?.message?.items.find((item) =>
    item.title.some((t) => t.toLowerCase() === queryTitle.toLowerCase()),
  );

  logger.info({ matchFound, queryTitle }, 'DOI Response');

  let doi: string;
  let metadata: MetadataResponse;

  if (works.ok && matchFound) {
    doi = matchFound.DOI;
    metadata = transformWorkToMetadata(matchFound);
  }

  // pull metadata from AM service
  metadata = await metadataClient.getResourceMetadata({
    cid: component.payload.cid,
    doi: doi || component.payload?.doi?.[0],
  });

  // todo: pull metadata from crossrefClient#getDoiMetadata
  // const doiMetadata = await crossRefClient.getDoiMetadata('');

  if (!metadata) throw new NotFoundError('DOI not found!');

  const actions: ManifestActions[] = [];

  if (doi) {
    actions.push({
      type: 'Update Component',
      component: {
        ...component,
        payload: {
          ...component.payload,
          doi: component.payload?.doi ? component.payload.doi.concat([doi]) : [doi],
        } as PdfComponentPayload,
      },
      componentIndex,
    });
  }

  if (metadata?.abstract.trim()) {
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

const transformWorkToMetadata = (work: Work): MetadataResponse => {
  const title = work.title[0];
  const authors = work.author.map((author) => ({
    orcid: author.ORCID ? getOrcidFromURL(author.ORCID) : null,
    name: author.given ? `${author.given} ${author.family}`.trim() : author.name,
    affiliations: author.affiliation.map((org) => ({ name: org.name, id: '' })),
  }));

  return { title, authors, pdfUrl: '', keywords: [] };
};
