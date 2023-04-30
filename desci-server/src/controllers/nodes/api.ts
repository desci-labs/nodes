import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

export const api = async (req: Request, res: Response, next: NextFunction) => {
  const { data } = await axios.post(process.env.CSO_CLASSIFIER_API, req.body);
  res.send(data);
};
