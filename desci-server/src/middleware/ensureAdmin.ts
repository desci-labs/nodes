import { Request, Response, NextFunction } from 'express';

import { RequestWithUser } from './authorisation.js';

// export const ensureUser = async (req: Request, res: Response, next: NextFunction) => {
//   const userId = req.session.userId;
//   console.log('REQ SESS', req.session, req.cookies);
//   if (!userId) {
//     const customError = new CustomError(401, 'General', 'User ID missing from session');
//     return next(customError);
//   }

//   const user = await prisma.user.findUnique({
//     where: {
//       id: userId,
//     },
//   });

//   req.session.user = user;

//   return next();
// };
const disableList = ['noreply+test@desci.com'];

export const ensureAdmin = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = req.user;

  if (user.email.indexOf('@desci.com') > -1 && disableList.indexOf(user.email) < 0) {
    next();
    return;
  }

  res.sendStatus(401);
};

export const ensureUserIsAdmin = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const user = req.user;

  if (user.email.indexOf('@desci.com') > -1 && disableList.indexOf(user.email) < 0) {
    next();
    return;
  } else if (user.isAdmin) {
    next();
    return;
  }

  res.sendStatus(401);
};
