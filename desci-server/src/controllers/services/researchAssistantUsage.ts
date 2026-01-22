// /**
//  * Research Assistant Usage Controller
//  * Handles GET /v1/services/ai/research-assistant/usage endpoint
//  */

// import { Request, Response, NextFunction } from 'express';
// import { getUserUsageData } from '../../services/subscription.js';
// import { logger } from '../../logger.js';

// export const getResearchAssistantUsage = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const user = (req as any).user;

//     if (!user || !user.id) {
//       res.status(401).json({
//         ok: false,
//         message: 'Unauthorized',
//       });
//       return;
//     }

//     const usageData = await getUserUsageData(user.id);

//     if (!usageData) {
//       res.status(404).json({
//         ok: false,
//         message: 'Usage data not found',
//       });
//       return;
//     }

//     res.json({
//       ok: true,
//       data: usageData,
//     });
//   } catch (error) {
//     logger.error({ error, userId: (req as any).user?.id }, 'Error getting research assistant usage');
//     next(error);
//   }
// };
