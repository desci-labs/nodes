import type { Request, Response, NextFunction } from 'express';
import { BaseError } from '../utils/customErrors.js';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  let statusCode = 500;
  if (err instanceof BaseError && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
  }

  return res.status(statusCode).json({
    message: err.message || 'Something went wrong',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};
