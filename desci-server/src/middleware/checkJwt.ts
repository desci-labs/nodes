import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { oneYear } from 'controllers/auth';

import { JwtPayload } from '../types/JwtPayload';
import { CustomError } from '../utils/response/custom-error/CustomError';

export const checkJwt = (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined;

  // Check if the token exists in the cookie
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  } else {
    // If not in the cookie, check the auth header
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      const customError = new CustomError(400, 'General', 'Authorization header not provided');
      return next(customError);
    }
    token = authHeader.split(' ')[1];
  }

  let jwtPayload: { [key: string]: any };
  try {
    jwtPayload = jwt.verify(token, process.env.JWT_SECRET as string) as { [key: string]: any };
    ['iat', 'exp'].forEach((keyToRemove) => delete jwtPayload[keyToRemove]);
    req.jwtPayload = jwtPayload as JwtPayload;
  } catch (err) {
    const customError = new CustomError(401, 'Raw', 'JWT error', null, err);
    return next(customError);
  }

  try {
    // Refresh and send a new token on every request
    const newToken = jwt.sign(jwtPayload as JwtPayload, process.env.JWT_SECRET, { expiresIn: '1y' });

    // TODO: Bearer token still returned for backwards compatability, should look to remove in the future.
    res.setHeader('token', `Bearer ${newToken}`);

    res.cookie('auth_token', newToken, {
      maxAge: oneYear,
      httpOnly: true, // Ineffective whilst we still return the bearer token to the client in the response
      secure: process.env.NODE_ENV === 'production',
      domain: process.env.NODE_ENV === 'production' ? '.desci.com' : 'localhost',
      sameSite: 'strict',
    });

    return next();
  } catch (err) {
    const customError = new CustomError(400, 'Raw', "Token can't be created", null, err);
    return next(customError);
  }
};
