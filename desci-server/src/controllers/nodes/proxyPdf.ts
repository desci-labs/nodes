// Mirror PDF for CORS
import { Request, Response, NextFunction } from 'express';
import request from 'request';

import logger from 'logger';

export const proxyPdf = async (req: Request, res: Response) => {
  const { q } = req.query;
  logger.info({ module: 'NODES::proxyPdfController', q }, `Proxying ${q}`);

  const src = request(q);
  req.pipe(src).pipe(res);
};
