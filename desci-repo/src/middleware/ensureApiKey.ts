import { Request, Response, NextFunction } from 'express';
const REPO_SERVICE_API_KEY = process.env.REPO_SERVICE_SECRET_KEY;

export const ensureApiKey = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== REPO_SERVICE_API_KEY) {
    res.sendStatus(401);
    return;
  }
  next();
};
