import { differenceInDays, endOfDay, startOfDay, subDays, toDate } from 'date-fn-latest';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { communityService } from '../../../services/Communities.js';
import { countUniqueUsersPublished } from '../../../services/node.js';
import { countAllGuestUsersWhoSignedUp, countAllUsers } from '../../../services/user.js';
import { metricsApiOptionalSchema } from '../schema.js';

type PublishMetricsRequest = ValidatedRequest<typeof metricsApiOptionalSchema, AuthenticatedRequest>;
type PublishMetricsResponse = {
  totalUsers: number;
  publishers: number;
  publishersInCommunity: number;
  guestSignUpSuccessRate: number;
  previousPeriod?: {
    totalUsers: number;
    publishers: number;
    publishersInCommunity: number;
    guestSignUpSuccessRate: number;
  };
};

export const getPublishMetrics = async (req: PublishMetricsRequest, res: Response) => {
  const { from, to, compareToPreviousPeriod } = req.validatedData.query;

  const range = from && to ? { from: startOfDay(from), to: endOfDay(to) } : undefined;

  const diffInDays = range ? differenceInDays(range.to, range.from) : 0;
  const prevStartDate = range ? startOfDay(subDays(range.from, diffInDays)) : undefined;
  const prevEndDate = range ? endOfDay(subDays(range.to, diffInDays)) : undefined;

  const prevRange = range && compareToPreviousPeriod ? { from: prevStartDate, to: prevEndDate } : undefined;

  logger.trace({ fn: 'getPublishMetrics', range, compareToPreviousPeriod, prevRange }, 'getPublishMetrics');

  const [totalUsers, publishers, publishersInCommunity, guestSignUpSuccessRate] = await Promise.all([
    countAllUsers(range),
    countUniqueUsersPublished(range),
    communityService.countUniqueUsersCommunitySubmission(range),
    countAllGuestUsersWhoSignedUp(range),
  ]);

  let data: PublishMetricsResponse = {
    totalUsers,
    publishers: Math.round((Number(publishers) / totalUsers) * 100),
    publishersInCommunity: Math.round((publishersInCommunity / totalUsers) * 100),
    guestSignUpSuccessRate,
  };

  if (compareToPreviousPeriod) {
    const [prevTotalUsers, prevPublishers, prevPublishersInCommunity, guestSignUpSuccessRate] = await Promise.all([
      countAllUsers(prevRange),
      countUniqueUsersPublished(prevRange),
      communityService.countUniqueUsersCommunitySubmission(prevRange),
      countAllGuestUsersWhoSignedUp(prevRange),
    ]);

    data = {
      ...data,
      previousPeriod: {
        totalUsers: prevTotalUsers,
        publishers: Math.round((Number(prevPublishers) / prevTotalUsers) * 100),
        publishersInCommunity: Math.round((prevPublishersInCommunity / prevTotalUsers) * 100),
        guestSignUpSuccessRate,
      },
    };
  }
  logger.trace({ data }, 'getPublishMetrics');
  new SuccessResponse(data).send(res);
};
