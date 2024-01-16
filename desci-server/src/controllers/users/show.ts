import { Request, Response, NextFunction } from 'express';

export const show = async (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
};
