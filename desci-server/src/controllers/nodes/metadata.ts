import { DocumentId } from '@automerge/automerge-repo';
import { ActionType } from '@prisma/client';
import { NextFunction, Response } from 'express';
import { z } from 'zod';

import {
  BadRequestError,
  InternalError,
  RequestWithNode,
  SuccessMessageResponse,
  SuccessResponse,
  metadataClient,
} from '../../internal.js';
import { MetadataResponse } from '../../services/AutomatedMetadata.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { isDoiLink } from '../data/utils.js';

export const automateMetadataSchema = z.object({
  params: z.object({
    uuid: z.string(),
  }),
  body: z.object({
    authors: z.array(
      z.object({
        orcid: z.string().optional(),
        name: z.string(),
        affiliation: z.string().optional(),
      }),
    ),
    title: z.string(),
    pdfUrl: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }),
});

export const automateMetadata = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const node = req.node;
  const metadata = req.body as MetadataResponse;

  if (metadata) {
    const response = await metadataClient.automateMetadata(metadata, {
      uuid: node.uuid,
      documentId: node.manifestDocumentId as DocumentId,
    });

    if (!response) throw new InternalError('Ran into an error while applying metadata');
    // await saveInteraction(req, ActionType.AUTOMATE_METADATA, { uuid: node.uuid });

    new SuccessMessageResponse().send(res);
  } else {
    throw new BadRequestError();
  }
};

export const generateMetadataSchema = z.object({
  body: z.object({
    cid: z.string().optional(),
    doi: z.string().optional(),
  }),
});

export const generateMetadata = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { cid, doi } = req.body;
  if (!cid && !isDoiLink(doi)) throw new BadRequestError('Invalid DOI url');
  const metadata = await metadataClient.getResourceMetadata({ cid, doi });
  // await saveInteraction(req, ActionType.GENERATE_METADATA, { uuid: node.uuid, cid, status: !!metadata });

  return new SuccessResponse(metadata).send(res);
};
