import { Request, Response, NextFunction } from 'express';

import { logger as parentLogger } from '../../logger.js';
import { getIndexedResearchObjects, IndexedResearchObject } from '../../theGraph.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({
  module: 'RAW::versionsController',
});

/**
 * Get all versions of research object from index (publicView)
 */
export const versions = async (req: Request, res: Response, next: NextFunction) => {
  const uuid = ensureUuidEndsWithDot(req.params.uuid);
  let result: IndexedResearchObject;

  try {
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    result = researchObjects[0];
  } catch (err) {
    logger.error({ result, err }, `[ERROR] graph lookup fail ${err.message}`);
  }
  if (!result) {
    logger.warn({ uuid, result }, 'could not find indexed versions');
    res.status(404).send({ ok: false, msg: `could not locate uuid ${uuid}` });
    return;
  }

  res.send(result);
};
