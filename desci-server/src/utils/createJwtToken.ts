import jwt from 'jsonwebtoken';

import { JwtPayload } from '../types/JwtPayload.js';

export const createJwtToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET as jwt.Secret, {
    expiresIn: process.env.JWT_EXPIRATION as jwt.SignOptions['expiresIn'],
  });
};
