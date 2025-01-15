import { NextFunction, Response, Router } from 'express';
import { Request } from 'express';

import { prisma } from '../../../../client.js';
import { searchUserProfiles } from '../../../../controllers/admin/users.js';
import { SuccessMessageResponse, SuccessResponse } from '../../../../core/ApiResponse.js';
import { ensureAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/permissions.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

// const logger = parentLogger.child({ module: 'Admin/communities' });
const router = Router();

router.get('/search', [ensureUser, ensureAdmin], asyncHandler(searchUserProfiles));

router.patch(
  '/:userId/toggleRole',
  [ensureUser, ensureAdmin],
  asyncHandler(async (req: Request<{ userId: number }, any>, res: Response, _next: NextFunction) => {
    const userId = req.params.userId;
    const user = await prisma.user.findFirst({ where: { id: parseInt(userId.toString()) }, select: { isAdmin: true } });
    await prisma.user.update({ where: { id: parseInt(userId.toString()) }, data: { isAdmin: !user.isAdmin } });
    new SuccessMessageResponse().send(res);
  }),
);

export default router;
