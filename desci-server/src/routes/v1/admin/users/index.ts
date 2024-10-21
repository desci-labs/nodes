import { NextFunction, Response, Router } from 'express';

import { SuccessResponse } from '../../../../core/ApiResponse.js';
import { ensureAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/permissions.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

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
