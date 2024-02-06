import { NextFunction, Request, Response } from 'express';

export const getCommunityFeed = async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).send({});
};
