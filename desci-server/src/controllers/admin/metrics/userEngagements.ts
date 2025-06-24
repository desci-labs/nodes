import { endOfDay, startOfDay, subDays } from 'date-fns';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { logger } from '../../../logger.js';
import { RequestWithUser } from '../../../middleware/index.js';
import {
  countExploringUsersInRange,
  countResearchObjectsShared,
  countResearchObjectsUpdated,
  getCountActiveUsersInXDays,
} from '../../../services/admin/interactionLog.js';
import { countAllCommunityNodes, countAllNodes, countAllPublishedNodes } from '../../../services/node.js';

const getActiveUsersEngagementMetrics = async () => {
  const [daily, weekly, monthly] = await Promise.all([
    getCountActiveUsersInXDays(1),
    getCountActiveUsersInXDays(7),
    getCountActiveUsersInXDays(30),
  ]);

  return { daily, weekly, monthly };
};

const getPublishingUsersEngagementMetrics = async () => {
  const [
    researchObjectsCreated,
    researchObjectsUpdated,
    researchObjectsShared,
    researchObjectsPublished,
    communityPublications,
  ] = await Promise.all([
    countAllNodes(),
    countResearchObjectsUpdated(),
    countResearchObjectsShared(),
    countAllPublishedNodes(),
    countAllCommunityNodes(),
  ]);

  return {
    researchObjectsCreated,
    researchObjectsUpdated,
    researchObjectsShared,
    researchObjectsPublished,
    communityPublications,
  };
};

const getExploringUsersEngagementMetrics = async () => {
  const daily = await countExploringUsersInRange({
    from: startOfDay(subDays(new Date(), 1)),
    to: endOfDay(new Date()),
  });
  const weekly = await countExploringUsersInRange({
    from: startOfDay(subDays(new Date(), 7)),
    to: endOfDay(new Date()),
  });
  const monthly = await countExploringUsersInRange({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });

  return { daily, weekly, monthly };
};

export const getUserEngagementMetrics = async (req: RequestWithUser, res: Response) => {
  const activeUsers = await getActiveUsersEngagementMetrics();
  const publishingUsers = await getPublishingUsersEngagementMetrics();
  const exploringUsers = await getExploringUsersEngagementMetrics();
  logger.trace({ activeUsers, publishingUsers, exploringUsers }, 'getUserEngagementMetrics');

  new SuccessResponse({ activeUsers, publishingUsers, exploringUsers }).send(res);
};
