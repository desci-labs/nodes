import { NextFunction, Response } from 'express';

// import { RequestWithUser, SuccessResponse, doiService, logger as parentLogger } from '../../internal.js';

const logger = parentLogger.child({ module: 'ADMIN::DOI' });
export const listDoiRecords = async (_req: RequestWithUser, res: Response, _next: NextFunction) => {
  const data = await doiService.listDoi();
  logger.info({ data }, 'List DOIs');
  new SuccessResponse(data).send(res);
};
