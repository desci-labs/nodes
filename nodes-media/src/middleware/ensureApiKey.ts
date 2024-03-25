import type { Request, Response, NextFunction } from 'express';
const MEDIA_SERVER_API_KEY = process.env.MEDIA_SECRET_KEY;

export const ensureApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== MEDIA_SERVER_API_KEY) {
    res.sendStatus(401);
    return;
  }
  next();
};
