import { DocumentId } from '@automerge/automerge-repo';
import { CommonComponentPayload, PdfComponent, ResearchObjectComponentType } from '@desci-labs/desci-models';
import { NextFunction, Request, Response } from 'express';

import { DoiError } from '../../core/doi/error.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  RequestWithNode,
  SuccessResponse,
  crossRefClient,
  doiService,
  getLatestManifestFromNode,
  logger as parentLogger,
} from '../../internal.js';
import { WorkSelectOptions } from '../../services/crossRef/definitions.js';
import repoService from '../../services/repoService.js';

export const checkMintability = async (req: Request, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();

  const logger = parentLogger.child({
    module: 'DOI::checkMintability',
  });

  try {
    await doiService.checkMintability(uuid);
    new SuccessResponse(true).send(res);
  } catch (err) {
    logger.error(err, 'module:: checkMintability');
    if (!(err instanceof DoiError)) {
      // TODO: Sentry error reporting
    }
    new SuccessResponse(false).send(res);
  }
};

export const getDoi = async (req: Request, res: Response, next: NextFunction) => {
  const { identifier } = req.params;
  if (!identifier) throw new BadRequestError();

  const doi = await doiService.getDoiByDpidOrUuid(identifier);
  new SuccessResponse(doi).send(res);
};

export const attachDoi = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
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

  const doi = works?.data?.message?.items.find((item) => item.title.some((t) => t === queryTitle));

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
        component: { ...component, payload: { ...component.payload, doi: doi.DOI } },
        componentIndex,
      },
    ],
  });

  logger.info(response.manifest.components[componentIndex], 'component updated');

  new SuccessResponse(true).send(res);
};
