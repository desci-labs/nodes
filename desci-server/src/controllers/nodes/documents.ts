import { DocumentId } from '@automerge/automerge-repo';
import { ManifestActions } from '@desci-labs/desci-models';
import { Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { getLatestManifest } from '../data/utils.js';

export const getNodeDocument = async function (req: RequestWithNode, response: Response) {
  const logger = parentLogger.child({ module: 'getNodeDocument' });
  try {
    logger.info({ userId: req.user.id, uuid: req.node.uuid }, '[START] GetNodeDocument');

    const node = req.node;
    const manifest = await getLatestManifest(node.uuid!, req.query?.g as string, node);

    if (!manifest) {
      logger.error({ uuid: node.uuid }, 'Node could not be migrated to draft, No manifest found');
      response.status(400).send({ ok: false, message: 'Node could not be migrated to draft, No manifest found' });
      return;
    }

    if (!node.manifestDocumentId) {
      const result = await repoService.initDraftDocument({ uuid: node.uuid!, manifest });

      if (!result) {
        logger.error({ result, uuid: node.uuid }, 'Automerge document Creation Error');
        response.status(400).send({ ok: false, message: 'Could not intialize new draft document' });
        return;
      }

      await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: result.documentId } });

      response.status(200).send({ documentId: result.document, document: result.document });
    } else {
      const document = await repoService.getDraftDocument({ uuid: node.uuid as NodeUuid });
      response.status(200).send({ documentId: node.manifestDocumentId, document });
    }
  } catch (err) {
    logger.error({ err }, 'Creating new document Error', req.body, err);

    response.status(500).send({ ok: false, message: JSON.stringify(err) });
  }
};

export const dispatchDocumentChange = async function (req: RequestWithNode, response: Response) {
  const logger = parentLogger.child({ module: 'dispatchDocumentChange', userId: req.user.id, uuid: req.node.uuid });
  try {
    const node = req.node;
    const actions = req.body.actions as ManifestActions[];

    if (!(actions && actions.length > 0)) {
      response.status(400).send({ ok: false, message: 'No actions to dispatch' });
      return;
    }

    if (!node.manifestDocumentId) {
      response.status(400).send({ ok: false, message: 'Node is Missing automerge document' });
      return;
    } else {
      const result = await repoService.dispatchChanges({
        uuid: node.uuid!,
        documentId: node.manifestDocumentId as DocumentId,
        actions,
      });

      if ('status' in result) {
        response.status(result.status).send(result);
      } else {
        response.status(200).send({ documentId: node.manifestDocumentId, document: result });
      }

      return;
    }
  } catch (err) {
    logger.error({ err }, 'Dispatch Actions Error', req.body, err);

    response.status(500).send({ ok: false, message: JSON.stringify(err) });
    return;
  }
};
