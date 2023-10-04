import { Request, Response, NextFunction } from 'express';

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

export const ensureAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (user.email.indexOf('@desci.com') > -1 && disableList.indexOf(user.email) < 0) {
    next();
    return;
  }

  res.sendStatus(401);
};
