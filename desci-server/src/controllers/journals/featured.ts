import { JournalSubmission, Prisma, SubmissionStatus } from '@prisma/client';
import { Response } from 'express';
import { errWithCause } from 'pino-std-serializers';

import { sendError, sendSuccess } from '../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../core/types.js';
import { logger as parentLogger } from '../../logger.js';
import { delFromCache, getFromCache, setToCache } from '../../redisClient.js';
import { listFeaturedPublicationsSchema } from '../../schemas/journals.schema.js';
import {
  journalSubmissionService,
  FeaturedSubmissionDetails,
} from '../../services/journals/JournalSubmissionService.js';
import { asyncMap } from '../../utils.js';

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

const featuredPubCackeKey = (journalId?: number, search?: string, startDate?: Date, endDate?: Date) =>
  `featured-publications-${journalId ?? 'all'}${search ? `-${search}` : ''}${startDate ? `-${startDate.toISOString()}` : ''}${endDate ? `-${endDate.toISOString()}` : ''}`;

export const listFeaturedPublicationsController = async (
  req: ListFeaturedJournalPublicationsRequest,
  res: Response,
) => {
  try {
    const { limit, offset, startDate, endDate, sortBy, sortOrder, search } = req.validatedData.query;

    const cacheKey = featuredPubCackeKey(undefined, search, startDate, endDate);

    logger.trace({ cacheKey }, 'listFeaturedPublicationsController::cacheKey');
    const cachedFeaturedPubs = await getFromCache<FeaturedSubmissionDetails[]>(cacheKey);
    if (cachedFeaturedPubs) {
      return sendSuccess(res, { data: cachedFeaturedPubs, meta: { count: cachedFeaturedPubs.length, limit, offset } });
    }

    const filter: Prisma.JournalSubmissionWhereInput = {
      status: SubmissionStatus.ACCEPTED,
    };

    if (search) {
      filter.node = {
        title: { contains: search, mode: 'insensitive' },
      };
    }

    if (startDate) {
      filter.submittedAt = { gte: startDate };

      if (endDate) {
        filter.submittedAt = { lte: endDate };
      }
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

    logger.trace({ filter, orderBy, offset, limit, cacheKey }, 'listFeaturedPublicationsController::filter');

    const publications = await journalSubmissionService.getFeaturedJournalPublications(filter, orderBy, offset, limit);
    logger.trace({ publications }, 'listFeaturedPublicationsController::publications');

    const data: Partial<JournalSubmission>[] = await asyncMap(publications, async (publication) => {
      const submissionExtended = await journalSubmissionService.getFeaturedPublicationDetails(publication.id);
      if (submissionExtended.isErr()) {
        return null;
      }
      return submissionExtended.value;
    });

    if (data && data.length > 0) {
      await setToCache(cacheKey, data, 60 * 60 * 24); // 24 hours
    }

    logger.trace({ publications }, 'listFeaturedPublicationsController');
    return sendSuccess(res, { data, meta: { count: publications.length, limit, offset } });
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

    const cacheKey = featuredPubCackeKey(journalId, search, startDate, endDate);

    logger.trace({ cacheKey }, 'listFeaturedJournalPublicationsController::cacheKey');
    const cachedFeaturedPubs = await getFromCache<FeaturedSubmissionDetails[]>(cacheKey);
    if (cachedFeaturedPubs) {
      return sendSuccess(res, { data: cachedFeaturedPubs, meta: { count: cachedFeaturedPubs.length, limit, offset } });
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

    if (startDate) {
      filter.submittedAt = { gte: startDate };

      if (endDate) {
        filter.submittedAt = { lte: endDate };
      }
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
      // TODO: order by impact
    }

    logger.trace({ filter, orderBy, offset, limit }, 'listFeaturedJournalPublicationsController::filter');

    const publications = await journalSubmissionService.getFeaturedJournalPublications(filter, orderBy, offset, limit);

    const data: Partial<JournalSubmission>[] = await asyncMap(publications, async (publication) => {
      const submissionExtended = await journalSubmissionService.getFeaturedPublicationDetails(publication.id);
      if (submissionExtended.isErr()) {
        return null;
      }
      return submissionExtended.value;
    });

    if (data.length > 0) {
      await setToCache(cacheKey, data, 60 * 60 * 24); // 24 hours
    }

    logger.trace({ publications }, 'listFeaturedJournalPublicationsController');
    return sendSuccess(res, { data, meta: { count: publications.length, limit, offset } });
  } catch (error) {
    logger.error({ error });
    return sendError(res, 'Failed to retrieve featured publications', 500);
  }
};
