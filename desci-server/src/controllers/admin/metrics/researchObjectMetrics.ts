import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { getFromCache, ONE_DAY_TTL, setToCache } from '../../../redisClient.js';
import {
  countAllNodes,
  countAverageResearchObjectsCreatedPerUser,
  countMedianResearchObjectsCreatedPerUser,
} from '../../../services/node.js';
import { metricsApiSchema } from '../schema.js';

type ResearchObjectMetricsRequest = ValidatedRequest<typeof metricsApiSchema, AuthenticatedRequest>;
type ResearchObjectMetricsResponse = {
  totalRoCreated: number;
  averageRoCreatedPerUser: number;
  medianRoCreatedPerUser: number;
  previousPeriod?: {
    totalRoCreated: number;
    averageRoCreatedPerUser: number;
    medianRoCreatedPerUser: number;
  };
};

export const getResearchObjectMetrics = async (req: ResearchObjectMetricsRequest, res: Response) => {
  const { from, to, compareToPreviousPeriod } = req.validatedData.query;
  const range = from ? { from: startOfDay(from), to: endOfDay(to ?? new Date()) } : undefined;

  // hard check the from and to dates are valid, to prevent previouse period from being bogus in cases where user selects a from and no to date.
  const diffInDays = from && to && compareToPreviousPeriod ? differenceInDays(range.to, range.from) + 1 : 0; // +1 to include the end date
  const prevStartDate = from && to && compareToPreviousPeriod ? startOfDay(subDays(range.from, diffInDays)) : undefined;
  const prevEndDate = from && to && compareToPreviousPeriod ? endOfDay(subDays(range.to, diffInDays)) : undefined;

  const prevRange =
    prevStartDate && prevEndDate && compareToPreviousPeriod ? { from: prevStartDate, to: prevEndDate } : undefined;

  logger.trace(
    { fn: 'getResearchObjectMetrics', from, to, compareToPreviousPeriod, prevStartDate, prevEndDate },
    'getResearchObjectMetrics',
  );

  const cacheKey = range
    ? `researchObjectMetrics-${range.from.toISOString()}-${range.to.toISOString()}-${compareToPreviousPeriod.toString()}`
    : `researchObjectMetrics`;
  const cachedResponse = await getFromCache<ResearchObjectMetricsResponse>(cacheKey);
  if (cachedResponse) {
    logger.trace({ cachedResponse }, 'getResearchObjectMetrics: CACHED RESPONSE');
    new SuccessResponse(cachedResponse).send(res);
    return;
  }

  const [totalRoCreated, averageRoCreatedPerUser, medianRoCreatedPerUser] = await Promise.all([
    countAllNodes(range),
    countAverageResearchObjectsCreatedPerUser(range),
    countMedianResearchObjectsCreatedPerUser(range),
  ]);

  let data: ResearchObjectMetricsResponse = {
    totalRoCreated,
    averageRoCreatedPerUser,
    medianRoCreatedPerUser,
  };

  if (compareToPreviousPeriod && prevRange) {
    const [prevTotalRoCreated, prevAverageRoCreatedPerUser, prevMedianRoCreatedPerUser] = await Promise.all([
      countAllNodes(prevRange),
      countAverageResearchObjectsCreatedPerUser(prevRange),
      countMedianResearchObjectsCreatedPerUser(prevRange),
    ]);

    data = {
      ...data,
      previousPeriod: {
        totalRoCreated: prevTotalRoCreated,
        averageRoCreatedPerUser: prevAverageRoCreatedPerUser,
        medianRoCreatedPerUser: prevMedianRoCreatedPerUser,
      },
    };
  }
  logger.trace({ data }, 'getResearchObjectMetrics');
  await setToCache(cacheKey, data, ONE_DAY_TTL);
  new SuccessResponse(data).send(res);
};
