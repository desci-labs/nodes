import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fn-latest';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { safePct } from '../../../services/admin/helper.js';
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

  const range = from ? { from: startOfDay(from), to: endOfDay(to ?? new Date()) } : undefined;

  // hard check the from and to dates are valid, to prevent previouse period from being bogus in cases where user selects a from and no to date.
  const diffInDays = from && to && compareToPreviousPeriod ? differenceInDays(range.to, range.from) + 1 : 0; // +1 to include the end date
  const prevStartDate = from && to && compareToPreviousPeriod ? startOfDay(subDays(range.from, diffInDays)) : undefined;
  const prevEndDate = from && to && compareToPreviousPeriod ? endOfDay(subDays(range.to, diffInDays)) : undefined;

  const prevRange =
    prevStartDate && prevEndDate && compareToPreviousPeriod ? { from: prevStartDate, to: prevEndDate } : undefined;

  logger.trace({ fn: 'getPublishMetrics', range, compareToPreviousPeriod, prevRange }, 'getPublishMetrics');

  const [totalUsers, publishers, publishersInCommunity, guestSignUpSuccessRate] = await Promise.all([
    countAllUsers(range),
    countUniqueUsersPublished(range),
    communityService.countUniqueUsersCommunitySubmission(range),
    countAllGuestUsersWhoSignedUp(range),
  ]);

  let data: PublishMetricsResponse = {
    totalUsers,
    publishers: safePct(publishers, totalUsers),
    publishersInCommunity: safePct(publishersInCommunity, totalUsers),
    guestSignUpSuccessRate,
  };

  if (compareToPreviousPeriod && prevRange) {
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
        publishers: safePct(prevPublishers, prevTotalUsers),
        publishersInCommunity: safePct(prevPublishersInCommunity, prevTotalUsers),
        guestSignUpSuccessRate,
      },
    };
  }
  logger.trace({ data }, 'getPublishMetrics');
  new SuccessResponse(data).send(res);
};
