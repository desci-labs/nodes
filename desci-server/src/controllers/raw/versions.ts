import { Request, Response, NextFunction } from 'express';

import { logger } from '../../logger.js';
import { getIndexedResearchObjects } from '../../theGraph.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

/**
 * Get all versions of research object from index (publicView)
 */
export const versions = async (req: Request, res: Response, next: NextFunction) => {
  const uuid = ensureUuidEndsWithDot(req.params.uuid);
  let graphOk = false;
  let result;
  try {
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    result = researchObjects[0];
    graphOk = true;
  } catch (err) {
    logger.error(
      { module: 'RAW::versionsController', graphOk, result, err },
      `[ERROR] graph lookup fail ${err.message}`,
    );
  }
  if (!result) {
    res.status(404).send({ ok: false, msg: `could not locate uuid ${uuid}` });
    return;
  }

  res.send(result);
};
