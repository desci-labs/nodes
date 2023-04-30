// Mirror PDF for CORS
import { Request, Response, NextFunction } from 'express';
import request from 'request';

export const proxyPdf = async (req: Request, res: Response) => {
  const { q } = req.query;
  console.log(`Proxying ${q}`)
  
  let src = request(q);
  req.pipe(src).pipe(res);
};
