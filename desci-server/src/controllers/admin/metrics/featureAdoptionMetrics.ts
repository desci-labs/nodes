import { differenceInDays, endOfDay, startOfDay, subDays } from 'date-fns';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger } from '../../../logger.js';
import { getFromCache, ONE_DAY_TTL, setToCache } from '../../../redisClient.js';
import {
  countClaimedBadgesLogs,
  countAiAnalyticsTabsClicks,
  countCoAuthorInvitations,
  countRelatedArticleClickedInAiAnalytics,
  countResearchObjectSharedLogs,
  countProfileViews,
  countGuestModeVisits,
} from '../../../services/admin/interactionLog.js';
import { metricsApiSchema } from '../schema.js';

type FeatureAdoptionMetricsRequest = ValidatedRequest<typeof metricsApiSchema, AuthenticatedRequest>;
type FeatureAdoptionMetricsResponse = {
  totalShares: number;
  totalCoAuthorInvites: number;
  totalAIAnalyticsClicks: number;
  totalMatchedArticleClicks: number;
  totalClaimedBadges: number;
  totalProfileViews: number;
  totalGuestModeVisits: number;
  previousPeriod?: {
    totalShares: number;
    totalCoAuthorInvites: number;
    totalAIAnalyticsClicks: number;
    totalMatchedArticleClicks: number;
    totalClaimedBadges: number;
    totalProfileViews: number;
    totalGuestModeVisits: number;
  };
};

export const getFeatureAdoptionMetrics = async (req: FeatureAdoptionMetricsRequest, res: Response) => {
  const { from, to, compareToPreviousPeriod } = req.validatedData.query;
  const range = from ? { from: startOfDay(from), to: endOfDay(to ?? new Date()) } : undefined;

  // hard check the from and to dates are valid, to prevent previouse period from being bogus in cases where user selects a from and no to date.
  const diffInDays = from && to && compareToPreviousPeriod ? differenceInDays(range.to, range.from) + 1 : 0; // +1 to include the end date
  const prevStartDate = from && to && compareToPreviousPeriod ? startOfDay(subDays(range.from, diffInDays)) : undefined;
  const prevEndDate = from && to && compareToPreviousPeriod ? endOfDay(subDays(range.to, diffInDays)) : undefined;

  const prevRange =
    prevStartDate && prevEndDate && compareToPreviousPeriod ? { from: prevStartDate, to: prevEndDate } : undefined;
  logger.trace({ fn: 'getFeatureAdoptionMetrics', range, prevRange }, 'getFeatureAdoptionMetrics');

  const cacheKey = range
    ? `featureAdoptionMetrics-${range.from.toISOString()}-${range.to.toISOString()}-${compareToPreviousPeriod.toString()}`
    : `featureAdoptionMetrics`;

  // Try to get cached response with error handling
  let cachedResponse: FeatureAdoptionMetricsResponse | null = null;

  try {
    cachedResponse = await getFromCache<FeatureAdoptionMetricsResponse>(cacheKey);
  } catch (error) {
    logger.error({ error, cacheKey }, 'Failed to read from cache in getFeatureAdoptionMetrics');
  }

  if (cachedResponse) {
    logger.trace({ cachedResponse }, 'getFeatureAdoptionMetrics: CACHED RESPONSE');
    new SuccessResponse(cachedResponse).send(res);
    return;
  }

  const [
    totalShares,
    totalCoAuthorInvites,
    totalAIAnalyticsClicks,
    totalMatchedArticleClicks,
    totalClaimedBadges,
    totalProfileViews,
    totalGuestModeVisits,
  ] = await Promise.all([
    countResearchObjectSharedLogs(range),
    countCoAuthorInvitations(range),
    countAiAnalyticsTabsClicks(range),
    countRelatedArticleClickedInAiAnalytics(range),
    countClaimedBadgesLogs(range),
    countProfileViews(range),
    countGuestModeVisits(range),
  ]);

  let data: FeatureAdoptionMetricsResponse = {
    totalShares,
    totalCoAuthorInvites,
    totalAIAnalyticsClicks,
    totalMatchedArticleClicks,
    totalClaimedBadges,
    totalProfileViews,
    totalGuestModeVisits,
  };

  if (compareToPreviousPeriod && prevRange) {
    const [
      prevTotalShares,
      prevTotalCoAuthorInvites,
      prevTotalAIAnalyticsClicks,
      prevTotalMatchedArticleClicks,
      prevTotalClaimedBadges,
      prevTotalProfileViews,
      prevTotalGuestModeVisits,
    ] = await Promise.all([
      countResearchObjectSharedLogs(prevRange),
      countCoAuthorInvitations(prevRange),
      countAiAnalyticsTabsClicks(prevRange),
      countRelatedArticleClickedInAiAnalytics(prevRange),
      countClaimedBadgesLogs(prevRange),
      countProfileViews(prevRange),
      countGuestModeVisits(prevRange),
    ]);

    data = {
      ...data,
      previousPeriod: {
        totalShares: prevTotalShares,
        totalCoAuthorInvites: prevTotalCoAuthorInvites,
        totalAIAnalyticsClicks: prevTotalAIAnalyticsClicks,
        totalMatchedArticleClicks: prevTotalMatchedArticleClicks,
        totalClaimedBadges: prevTotalClaimedBadges,
        totalProfileViews: prevTotalProfileViews,
        totalGuestModeVisits: prevTotalGuestModeVisits,
      },
    };
  }
  logger.trace({ data }, 'getFeatureAdoptionMetrics');

  // Try to set cache with error handling
  try {
    await setToCache(cacheKey, data, ONE_DAY_TTL);
  } catch (error) {
    logger.error({ error, cacheKey }, 'Failed to write to cache in getFeatureAdoptionMetrics');
  }

  new SuccessResponse(data).send(res);
};
