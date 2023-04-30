import { Request, Response, NextFunction } from 'express';

import prisma from 'client';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  const { email, tokendId } = req.body;

  if (!email) {
    res.status(400).send({ ok: false });
    return;
  }

  const user = await prisma.user.upsert({
    where: {
      email,
    },
    update: {},
    create: {
      email,
      isPatron: false,
      isWarden: false,
      isKeeper: false,
    },
  });

  res.send(user);

  // const userRepository = getRepository(User);
  // try {
  //   const user = await userRepository.findOne({ where: { email } });

  //   if (user) {
  //     const customError = new CustomError(400, 'General', 'User already exists', [
  //       `Email '${user.email}' already exists`,
  //     ]);
  //     return next(customError);
  //   }

  //   try {
  //     const newUser = new User();
  //     newUser.email = email;

  //     await userRepository.save(newUser);

  //     res.customSuccess(200, 'User successfully created.');
  //   } catch (err) {
  //     const customError = new CustomError(400, 'Raw', `User '${email}' can't be created`, null, err);
  //     return next(customError);
  //   }
  // } catch (err) {
  //   const customError = new CustomError(400, 'Raw', 'Error', null, err);
  //   return next(customError);
  // }
};
