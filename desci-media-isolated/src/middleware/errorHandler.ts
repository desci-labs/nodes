import type { Request, Response, NextFunction } from 'express';
import { BaseError } from '../utils/customErrors.js';
import { logger as parentLogger } from '../utils/logger.js';

const logger = parentLogger.child({ module: 'Error Handling Middleware' });

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.warn({ errorStack: err.stack }, 'Error caught in error handler middleware');

  let statusCode = 500;
  if (err instanceof BaseError && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
  }

  return res.status(statusCode).json({
    message: err.message || 'Something went wrong',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
