import { Request, Response, NextFunction } from 'express';

import { ApiError } from '../core/ApiError.js';
import { logger } from '../logger.js';
import { CustomError } from '../utils/response/custom-error/CustomError.js';

export const errorHandler = (err: Error | CustomError, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, 'ERROR HANDLER CALLED');
  if (err instanceof CustomError) res.status(err.HttpStatusCode || 500).json(err.JSON || err.stack || err.message);

  if (err instanceof ApiError) {
    ApiError.handle(err, res);
  } else {
    ApiError.transform(err, res);
  }
};
