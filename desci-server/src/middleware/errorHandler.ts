import { Request, Response, NextFunction } from 'express';

import { ApiError } from '../internal.js';
import { CustomError } from '../utils/response/custom-error/CustomError.js';

export const errorHandler = (err: Error | CustomError, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof CustomError) res.status(err.HttpStatusCode || 500).json(err.JSON || err.stack || err.message);

  if (err instanceof ApiError) {
    ApiError.handle(err, res);
  } else {
    ApiError.transform(err, res);
  }
};
