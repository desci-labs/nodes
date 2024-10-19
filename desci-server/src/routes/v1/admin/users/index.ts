import { NextFunction, Response, Router } from 'express';

import {
  asyncHandler,
  ensureAdmin,
  ensureUser,
  logger as parentLogger,
  SuccessResponse,
  validate,
} from '../../../../internal.js';

// const logger = parentLogger.child({ module: 'Admin/communities' });
const router = Router();

router.get(
  '/search',
  [ensureUser, ensureAdmin],
  asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    //
    new SuccessResponse([]).send(res);
  }),
);

export default router;
