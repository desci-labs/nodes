import { NextFunction, Request, Response } from 'express';

export type AsyncFunction<R = Request> = (req: R, res: Response, next: NextFunction) => Promise<any>;

export const asyncHandler =
  <R>(execution: AsyncFunction<R>) =>
  (req: Request, res: Response, next: NextFunction) => {
    execution(req as R, res, next).catch(next);
  };
