import { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';

import { sendError } from '../core/api.js';
import { BadRequestError, InternalError } from '../core/ApiError.js';
import { AuthenticatedRequest, OptionalAuthenticatedRequest } from '../core/types.js';
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

type RequestTypes = Request | AuthenticatedRequest | OptionalAuthenticatedRequest;

// Note: Happy to consolidate these into one, if we use cleaner err resp code
export const validateInputs = <T extends z.ZodRawShape, R extends RequestTypes = RequestTypes>(
  schema: z.ZodObject<T>,
) =>
  asyncHandler(async (req: R, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const validationErrors = err.issues.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        sendError(res, 'Invalid inputs', 400, validationErrors);
      }
      throw new InternalError(err.toString());
    }
  });
