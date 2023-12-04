import { NextFunction, Request as ExpressRequest, Response } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../logger.js';

export const ensureUser = async (req: ExpressRequest, res: Response, next: NextFunction) => {
  const token = await extractAuthToken(req);
  const retrievedUser = await extractUserFromToken(token);
  if (!retrievedUser) {
    res.status(401).send({ ok: false, message: 'Unauthorized' });
    return;
  }
  (req as any).user = retrievedUser;
  next();
};

export const extractAuthToken = async (request: ExpressRequest | Request) => {
  let token: string | undefined;
  // Try to retrieve the token from the auth header
  const authHeader = request.headers['authorization'];
  if (authHeader) {
    token = authHeader.split(' ')[1];
  }
  logger.info({ module: 'Permissions::extractAuthToken', authHeader }, 'Request');

  // If auth token wasn't found in the header, try retrieve from cookies
  if (!token && request['cookies']) {
    token = request['cookies']['auth'];
  }

  if (!token && request.headers['cookie']) {
    let parsedTokenValue = request.headers['cookie']
      .split(';')
      .map((entry) => entry.split('='))
      .filter(([key]) => key.trim().toLowerCase() === 'auth')[0];
    token = parsedTokenValue?.[1];
    console.log('parsedTokenValue', parsedTokenValue);
  }

  return token;
};

export const extractUserFromToken = async (token: string) => {
  return new Promise(async (resolve, reject) => {
    if (!token) {
      resolve(null);
      return;
    }

    jwt.verify(token, process.env.JWT_SECRET as string, async (err: any, user: any) => {
      if (err) {
        logger.info({ module: 'ExtractAuthUser', token }, 'anon request');
        //! TODO: REVERT BACK TO resolve(null)
        //! TODO: REVERT BACK TO resolve(null)
        //! TODO: REVERT BACK TO resolve(null)
        //! TODO: REVERT BACK TO resolve(null)
        //! TODO: REVERT BACK TO resolve(null)
        //! TODO: REVERT BACK TO resolve(null)
        resolve({});
        return;
      }

      if (!user) {
        resolve(null);
        return;
      }

      const loggedInUserEmail = user.email as string;
      const shouldFetchUserByOrcId = Boolean(user.orcid);

      const retrievedUser = null;
      //  const retrievedUser = shouldFetchUserByOrcId
      //    ? await getUserByOrcId(user.orcid)
      //    : await getUserByEmail(loggedInUserEmail);

      //  if (!retrievedUser || !retrievedUser.id) {
      //    resolve(null);
      //    return;
      //  }

      resolve(retrievedUser);
    });
  });
};
