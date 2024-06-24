import { DocumentId } from '@automerge/automerge-repo';
import {
  CommonComponentPayload,
  PdfComponent,
  PdfComponentPayload,
  ResearchObjectComponentType,
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
import { WorkSelectOptions } from '../../services/crossRef/definitions.js';
import repoService from '../../services/repoService.js';

export const attachDoiSchema = z.object({
  body: z.object({
    uuid: z.string(),
    path: z.string().startsWith('root/', 'Invalid component path'),
  }),
});

export const automateManuscriptDoi = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid, path } = req.body;

  const logger = parentLogger.child({
    module: 'DOI::AttachDOI',
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

  const doi = works?.data?.message?.items.find((item) =>
    item.title.some((t) => t.toLowerCase() === queryTitle.toLowerCase()),
  );

  logger.info({ doi, queryTitle }, 'DOI Response');

  if (!(doi && works.ok)) {
    logger.info({ data: works?.data?.message?.items }, 'DOI Not Found');
    throw new NotFoundError('DOI not found');
  }

  const response = await repoService.dispatchAction({
    uuid,
    documentId: node.manifestDocumentId as DocumentId,
    actions: [
      {
        type: 'Update Component',
        component: {
          ...component,
          payload: { ...component.payload, doi: component.payload.doi.concat(doi.DOI) } as PdfComponentPayload,
        },
        componentIndex,
      },
    ],
  });

  logger.info(response.manifest.components[componentIndex], 'component updated');

  new SuccessResponse(true).send(res);
};
