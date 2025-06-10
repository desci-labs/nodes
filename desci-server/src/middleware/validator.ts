import { NextFunction, Request, Response } from 'express';
import { ZodError, z, ZodTypeAny } from 'zod';

import { sendError } from '../core/api.js';
import { BadRequestError, InternalError } from '../core/ApiError.js';
import { logger } from '../logger.js';
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

// Note: Happy to consolidate these into one, if we use cleaner err resp code
export const validateInputs = <S extends ZodTypeAny, R extends Request = Request>(schema: S) =>
  asyncHandler(async (req: R, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req);
      (req as R & { validatedData: z.infer<S> }).validatedData = parsed;
      next();
    } catch (err) {
      logger.error({ err }, 'Error during validation');
      if (err instanceof ZodError) {
        const validationErrors = err.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        sendError(res, 'Invalid inputs', 400, validationErrors);
        return;
      }
      console.error('Internal error during validation:', err);
      throw new InternalError('An unexpected error occurred during input validation.');
    }
  });
