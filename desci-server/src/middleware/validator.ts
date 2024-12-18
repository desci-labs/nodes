import { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';

import { BadRequestError, InternalError } from '../core/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const validate = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        // console.log('Error', err);
        throw new BadRequestError(
          err.errors.map((err) => err.message).join(','),
          err.issues.map((err) => `${err.path[err.path.length - 1]}: ${err.message}`),
        );
      }
      throw new InternalError(err.toString());
    }
  });
