import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fn-latest';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import {
  countAllNodes,
  countAverageResearchObjectsCreatedPerUser,
  countMedianResearchObjectsCreatedPerUser,
} from '../../../services/node.js';
import { metricsApiOptionalSchema } from '../schema.js';

type ResearchObjectMetricsRequest = ValidatedRequest<typeof metricsApiOptionalSchema, AuthenticatedRequest>;
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
  const fromDate = startOfDay(from);
  const toDate = endOfDay(to);
  const diffInDays = differenceInDays(toDate, fromDate);
  const prevStartDate = startOfDay(subDays(fromDate, diffInDays));
  const prevEndDate = endOfDay(subDays(toDate, diffInDays));
  logger.trace(
    { fn: 'getResearchObjectMetrics', from, to, compareToPreviousPeriod, prevStartDate, prevEndDate },
    'getResearchObjectMetrics',
  );

  const range = from && to ? { from: fromDate, to: toDate } : undefined;
  const prevRange = from && to && compareToPreviousPeriod ? { from: prevStartDate, to: prevEndDate } : undefined;

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
  new SuccessResponse(data).send(res);
};
