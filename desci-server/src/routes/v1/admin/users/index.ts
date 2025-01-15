import { NextFunction, Response, Router } from 'express';
import { Request } from 'express';
import z from 'zod';

import { prisma } from '../../../../client.js';
import { SuccessMessageResponse, SuccessResponse } from '../../../../core/ApiResponse.js';
import { ensureAdmin } from '../../../../middleware/ensureAdmin.js';
import { ensureUser } from '../../../../middleware/permissions.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';

// const logger = parentLogger.child({ module: 'Admin/communities' });
const router = Router();

const userSearchSchema = z.object({
  query: z.object({
    page: z.coerce.number().optional().default(0),
    cursor: z.coerce.number().optional().default(1),
    limit: z.coerce.number().optional().default(20),
  }),
});

router.get(
  '/search',
  [ensureUser, ensureAdmin],
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const {
      query: { page, limit, cursor },
    } = await userSearchSchema.parseAsync(req);
    const count = await prisma.user.count({});
    const users = await prisma.user.findMany({ cursor: { id: cursor }, skip: page * limit, take: limit });

    new SuccessResponse({ cursor: users[users.length - 1].id, page, count, users }).send(res);
  }),
);

router.get(
  '/toggleAdmin',
  [ensureUser, ensureAdmin],
  asyncHandler(
    async (req: Request<any, any, { userId: number; isAdmin: boolean }>, res: Response, _next: NextFunction) => {
      const userId = req.body.userId;
      await prisma.user.update({ where: { id: userId }, data: { isAdmin: req.body.isAdmin } });
      new SuccessMessageResponse().send(res);
    },
  ),
);

export default router;
