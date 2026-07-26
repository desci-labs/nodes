import { Prisma, SubmissionStatus } from '@prisma/client';
import { Response } from 'express';
import { errWithCause } from 'pino-std-serializers';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache, setToCache } from '../../redisClient.js';
import { listFeaturedPublicationsSchema } from '../../schemas/journals.schema.js';
import {
  journalSubmissionService,
  FeaturedSubmissionDetails,
} from '../../services/journals/JournalSubmissionService.js';

const logger = parentLogger.child({
  module: 'Journals::FeaturedController',
});

const statusMap: Record<string, SubmissionStatus[]> = {
  new: [SubmissionStatus.SUBMITTED],
  assigned: [SubmissionStatus.UNDER_REVIEW, SubmissionStatus.REVISION_REQUESTED],
  under_review: [SubmissionStatus.UNDER_REVIEW],
  reviewed: [SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED],
  under_revision: [SubmissionStatus.REVISION_REQUESTED],
} as const;

type ListFeaturedJournalPublicationsRequest = ValidatedRequest<
  typeof listFeaturedPublicationsSchema,
  AuthenticatedRequest
>;

const featuredPubCackeKey = (
  journalId?: number,
  search?: string,
  startDate?: Date,
  endDate?: Date,
  limit?: number,
  offset?: number,
) =>
  `featured-publications-${journalId ?? 'all'}${search ? `-${search}` : ''}${startDate ? `-${startDate.toISOString()}` : ''}${endDate ? `-${endDate.toISOString()}` : ''}-limit${limit ?? 20}-offset${offset ?? 0}`;

type CachedFeaturedPublications = {
  data: FeaturedSubmissionDetails[];
  totalCount: number;
};

export const listFeaturedPublicationsController = async (
  req: ListFeaturedJournalPublicationsRequest,
  res: Response,
) => {
  try {
    const { limit, offset, startDate, endDate, sortBy, sortOrder, search } = req.validatedData.query;

    const cacheKey = featuredPubCackeKey(undefined, search, startDate, endDate, limit, offset);

    logger.trace({ cacheKey }, 'listFeaturedPublicationsController::cacheKey');
    const cachedFeaturedPubs = await getFromCache<CachedFeaturedPublications>(cacheKey);
    if (cachedFeaturedPubs) {
      const { data, totalCount } = cachedFeaturedPubs;
      const totalPages = Math.ceil(totalCount / limit);
      const currentPage = Math.floor(offset / limit) + 1;
      return sendSuccess(res, {
        data,
        meta: { count: data.length, totalCount, totalPages, currentPage, limit, offset },
      });
    }

    const filter: Prisma.JournalSubmissionWhereInput = {
      status: SubmissionStatus.ACCEPTED,
    };

    if (search) {
      filter.node = {
        title: { contains: search, mode: 'insensitive' },
      };
    }

    if (startDate || endDate) {
      filter.submittedAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    let orderBy: Prisma.JournalSubmissionOrderByWithRelationInput;
    if (sortBy) {
      if (sortBy === 'newest') {
        orderBy = {
          submittedAt: sortOrder,
        };
      } else if (sortBy === 'oldest') {
        orderBy = {
          submittedAt: sortOrder,
        };
      } else if (sortBy === 'title') {
        orderBy = {
          node: {
            title: sortOrder,
          },
        };
      }
    }

    const [publications, totalCount] = await Promise.all([
      journalSubmissionService.getFeaturedJournalPublications(filter, orderBy, offset, limit),
      journalSubmissionService.countFeaturedJournalPublications(filter),
    ]);

    const data = await journalSubmissionService.getBatchedFeaturedPublicationDetails(
      publications.map((p) => p.id),
    );

    await setToCache(cacheKey, { data, totalCount }, data?.length > 0 ? 60 * 60 * 24 : 60); // 24 hours

    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return sendSuccess(res, {
      data,
      meta: { count: data?.length ?? 0, totalCount, totalPages, currentPage, limit, offset },
    });
  } catch (error) {
    logger.error({ error: errWithCause(error) });
    return sendError(res, 'Failed to retrieve featured publications', 500);
  }
};

export const listFeaturedJournalPublicationsController = async (
  req: ListFeaturedJournalPublicationsRequest,
  res: Response,
) => {
  try {
    const { journalId } = req.validatedData.params;
    const { limit, offset, startDate, endDate, sortBy, sortOrder, search } = req.validatedData.query;

    const cacheKey = featuredPubCackeKey(journalId, search, startDate, endDate, limit, offset);

    logger.trace({ cacheKey }, 'listFeaturedJournalPublicationsController::cacheKey');
    const cachedFeaturedPubs = await getFromCache<CachedFeaturedPublications>(cacheKey);
    if (cachedFeaturedPubs) {
      const { data, totalCount } = cachedFeaturedPubs;
      const totalPages = Math.ceil(totalCount / limit);
      const currentPage = Math.floor(offset / limit) + 1;
      return sendSuccess(res, {
        data,
        meta: { count: data.length, totalCount, totalPages, currentPage, limit, offset },
      });
    }

    const filter: Prisma.JournalSubmissionWhereInput = {
      journalId,
      status: SubmissionStatus.ACCEPTED,
    };

    if (search) {
      filter.node = {
        title: { contains: search, mode: 'insensitive' },
      };
    }

    if (startDate || endDate) {
      filter.acceptedAt = {
        ...(startDate && { gte: startDate }),
        ...(endDate && { lte: endDate }),
      };
    }

    let orderBy: Prisma.JournalSubmissionOrderByWithRelationInput;
    if (sortBy) {
      if (sortBy === 'newest') {
        orderBy = {
          acceptedAt: sortOrder,
        };
      } else if (sortBy === 'oldest') {
        orderBy = {
          acceptedAt: sortOrder,
        };
      } else if (sortBy === 'title') {
        orderBy = {
          node: {
            title: sortOrder,
          },
        };
      }
      // TODO: order by impact
    }

    const [publications, totalCount] = await Promise.all([
      journalSubmissionService.getFeaturedJournalPublications(filter, orderBy, offset, limit),
      journalSubmissionService.countFeaturedJournalPublications(filter),
    ]);

    const data = await journalSubmissionService.getBatchedFeaturedPublicationDetails(
      publications.map((p) => p.id),
    );

    await setToCache(cacheKey, { data, totalCount }, data.length > 0 ? 60 * 60 * 24 : 60); // 24 hours

    const totalPages = Math.ceil(totalCount / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    logger.trace({ publications }, 'listFeaturedJournalPublicationsController');
    return sendSuccess(res, {
      data,
      meta: { count: publications.length, totalCount, totalPages, currentPage, limit, offset },
    });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to retrieve featured publications', 500);
  }
};
