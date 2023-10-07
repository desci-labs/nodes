import { Request, Response, NextFunction } from 'express';

export const destroy = async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
};
