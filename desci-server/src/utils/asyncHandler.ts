import { NextFunction, Request, Response } from 'express';

export type AsyncFunction = (req: Request, res: Response, next: NextFunction) => Promise<any>;

export const asyncHander = (execution: AsyncFunction) => (req: Request, res: Response, next: NextFunction) => {
  execution(req, res, next).catch(next);
};
