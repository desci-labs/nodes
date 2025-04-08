import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { getNodeToUse, updateManifestAndAddToIpfs } from '../../services/ipfs.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { cleanManifestForSaving } from '../../utils/manifestDraftUtils.js';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { AuthenticatedRequest } from '../notifications/create.js';

export const draftUpdate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { uuid, manifest } = req.body;
  const logger = parentLogger.child({
    // id: req.id,
    module: 'NODE::draftUpdateController',
    body: req.body,
    uuid,
    manifest,
    user: (req as any).user,
  });
  logger.trace('updateDraft');

  if (!uuid) {
    res.status(404).send();
    return;
  }

  try {
    const loggedIn = req.user;

    logger.info(`[draftUpdate] for user id ${loggedIn.id}`);
    const loggedInUser = loggedIn.id;

    if (!loggedInUser || loggedInUser < 1) {
      throw Error('User ID mismatch');
    }

    const node = await prisma.node.findFirst({
      where: {
        ownerId: loggedInUser,
        uuid: ensureUuidEndsWithDot(uuid),
      },
    });

    let manifestParsed: ResearchObjectV1;

    try {
      manifestParsed = await repoService.getDraftManifest({
        uuid: node.uuid as NodeUuid,
        documentId: node.manifestDocumentId,
      }); //await getDraftManifestFromUuid(node.uuid as NodeUuid);
    } catch (e) {
      manifestParsed = req.body.manifest as ResearchObjectV1;
    }

    if (!manifestParsed) {
      manifestParsed = req.body.manifest as ResearchObjectV1;
    }

    const updatedMeta: any = {};
    if (manifestParsed.title) updatedMeta.title = manifestParsed.title;

    cleanManifestForSaving(manifestParsed);

    const { cid: hash, nodeVersion } = await updateManifestAndAddToIpfs(manifestParsed, {
      userId: loggedInUser,
      nodeId: node.id,
      ipfsNode: getNodeToUse(loggedIn.isGuest),
    });

    const uri = `${hash}`;

    logger.info(
      {
        updatedMeta,
      },
      `Updating node ${node.uuid}`,
    );

    await prisma.node.update({
      where: {
        id: node.id,
      },
      data: {
        manifestUrl: uri,
        ...updatedMeta,
      },
    });

    const nodeCopy = Object.assign({}, node);
    nodeCopy.uuid = nodeCopy.uuid.replace(/\.$/, '');

    res.send({
      ok: true,
      hash,
      uri,
      node: nodeCopy,
      version: nodeVersion,
    });
  } catch (err) {
    logger.error({ err }, 'node-update-err', err);
    res.status(400).send({ ok: false, error: err.message });
  }
};
