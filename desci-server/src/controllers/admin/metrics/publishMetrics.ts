import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fn-latest';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { communityService } from '../../../services/Communities.js';
import { countUniqueUsersPublished } from '../../../services/node.js';
import { countAllGuestUsersWhoSignedUp, countAllUsers } from '../../../services/user.js';
import { metricsApiSchema } from '../schema.js';

type PublishMetricsRequest = ValidatedRequest<typeof metricsApiSchema, AuthenticatedRequest>;
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
  const fromDate = startOfDay(from);
  const toDate = endOfDay(to);
  const diffInDays = differenceInDays(toDate, fromDate);
  const prevStartDate = startOfDay(subDays(fromDate, diffInDays));
  const prevEndDate = endOfDay(subDays(toDate, diffInDays));
  logger.trace(
    { fn: 'getPublishMetrics', from, to, compareToPreviousPeriod, prevStartDate, prevEndDate },
    'getPublishMetrics',
  );

  const [totalUsers, publishers, publishersInCommunity, guestSignUpSuccessRate] = await Promise.all([
    countAllUsers({ from: fromDate, to: toDate }),
    countUniqueUsersPublished({ from: fromDate, to: toDate }),
    communityService.countUniqueUsersCommunitySubmission({
      from: fromDate,
      to: toDate,
    }),
    countAllGuestUsersWhoSignedUp({ from: fromDate, to: toDate }),
  ]);

  let data: PublishMetricsResponse = {
    totalUsers,
    publishers: Math.round((Number(publishers) / totalUsers) * 100),
    publishersInCommunity: Math.round((publishersInCommunity / totalUsers) * 100),
    guestSignUpSuccessRate,
  };

  if (compareToPreviousPeriod) {
    const [prevTotalUsers, prevPublishers, prevPublishersInCommunity, guestSignUpSuccessRate] = await Promise.all([
      countAllUsers({ from: prevStartDate, to: prevEndDate }),
      countUniqueUsersPublished({ from: prevStartDate, to: prevEndDate }),
      communityService.countUniqueUsersCommunitySubmission({ from: prevStartDate, to: prevEndDate }),
      countAllGuestUsersWhoSignedUp({ from: prevStartDate, to: prevEndDate }),
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
