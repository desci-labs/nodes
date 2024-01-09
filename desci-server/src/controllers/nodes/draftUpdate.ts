import { ResearchObjectV1 } from '@desci-labs/desci-models';
import { Request, Response, NextFunction } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { updateManifestAndAddToIpfs } from '../../services/ipfs.js';
import { NodeUuid, getDraftManifestFromUuid } from '../../services/manifestRepo.js';
import { cleanManifestForSaving } from '../../utils/manifestDraftUtils.js';

export const draftUpdate = async (req: Request, res: Response, next: NextFunction) => {
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
    const loggedInUserEmail = (req as any).user.email;

    const loggedIn = await prisma.user.findFirst({
      where: {
        email: loggedInUserEmail,
      },
    });

    logger.info(`[draftUpdate] for user id ${loggedIn.id}`);
    const loggedInUser = loggedIn.id;

    if (!loggedInUser || loggedInUser < 1) {
      throw Error('User ID mismatch');
    }

    const node = await prisma.node.findFirst({
      where: {
        ownerId: loggedInUser,
        uuid: uuid + '.',
      },
    });

    let manifestParsed: ResearchObjectV1;

    try {
      manifestParsed = await getDraftManifestFromUuid(node.uuid as NodeUuid);
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
