import { NextFunction, Response } from 'express';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';
import { doiService } from '../../services/index.js';

const logger = parentLogger.child({ module: 'ADMIN::DOI' });
export const listDoiRecords = async (_req: RequestWithUser, res: Response, _next: NextFunction) => {
  const data = await doiService.listDoi();
  logger.info({ data }, 'List DOIs');
  new SuccessResponse(data).send(res);
};
