import { Prisma, SubmissionStatus } from '@prisma/client';
import { err, ok } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';

export type JournalReview = Record<string, any>[];

// function to get submission reviews (submissionId)
async function getSubmissionReviews({
  submissionId,
  limit = 20,
  offset = 0,
}: {
  submissionId: number;
  limit?: number;
  offset?: number;
}) {
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: { submissionId },
    skip: offset,
    take: limit,
    include: {
      refereeAssignment: {
        select: {
          referee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          completedAssignment: true,
          completedAt: true,
          dueDate: true,
        },
      },
    },
  });
  return reviews;
}

// function to check if submission has been reviewed (submissionId)
async function isSubmissionReviewed(submissionId: number) {
  const reviews = await getSubmissionReviews({ submissionId, offset: 0, limit: 1 });
  return reviews.length > 0;
}

async function checkRefereeSubmissionReview({
  journalId,
  refereeUserId,
  submissionId,
}: {
  journalId: number;
  refereeUserId: number;
  submissionId: number;
}) {
  const review = await prisma.journalSubmissionReview.findFirst({
    where: { journalId, submissionId, refereeAssignment: { userId: refereeUserId } },
    select: {
      id: true,
      refereeAssignmentId: true,
      submissionId: true,
      review: true,
      recommendation: true,
    },
  });

  return ok(review);
}

type SaveReviewUpdateFields = Pick<
  Prisma.JournalSubmissionReviewUncheckedCreateInput,
  'recommendation' | 'editorFeedback' | 'authorFeedback' | 'review'
>;

async function saveReview({
  journalId,
  submissionId,
  refereeUserId,
  update,
  reviewId,
}: {
  journalId: number;
  submissionId: number;
  refereeUserId: number;
  update: SaveReviewUpdateFields;
  reviewId?: number;
}) {
  const refereeAssignment = await prisma.refereeAssignment.findFirst({
    where: { submissionId, journalId, userId: refereeUserId },
  });

  if (!refereeAssignment) {
    return err('Referee not assigned to submission');
  }

  let review = await prisma.journalSubmissionReview.findFirst({
    where: {
      ...(reviewId !== undefined ? { id: reviewId } : {}),
      refereeAssignmentId: refereeAssignment.id,
      submissionId,
      journalId,
      submittedAt: null,
    },
  });

  if (reviewId !== undefined && review === null) {
    return err('Review not found');
  }

  if (review) {
    review = await prisma.journalSubmissionReview.update({
      where: { id: review.id },
      data: {
        ...update,
        refereeAssignmentId: refereeAssignment.id,
        submissionId,
        journalId,
      },
    });
  } else {
    review = await prisma.journalSubmissionReview.create({
      data: {
        ...update,
        refereeAssignmentId: refereeAssignment.id,
        submissionId,
        journalId,
      },
    });
  }

  return ok(review);
}

// function to submit review
async function submitReview({ reviewId, update }: { reviewId: number; update: SaveReviewUpdateFields }) {
  const review = await prisma.journalSubmissionReview.findFirst({
    where: { id: reviewId },
  });

  if (!review) {
    return err('Review not found');
  }

  if (review.submittedAt) {
    return err('Review already submitted');
  }

  const updateArgs = { ...review, ...update };
  if (!updateArgs.recommendation || !updateArgs.review || !updateArgs.editorFeedback || !updateArgs.authorFeedback) {
    return err('Review, recommendation, editor feedback and author feedback are required');
  }

  const updatedReview = await prisma.journalSubmissionReview.update({
    where: { id: review.id },
    data: {
      ...updateArgs,
      submittedAt: new Date(),
    },
  });

  return ok(updatedReview);
}

// function to list referee reviews (refereeId)
async function getRefereeReviewsByJournalId({
  refereeUserId,
  journalId,
}: {
  refereeUserId: number;
  journalId: number;
}) {
  // todo: check if referee is assigned to the journal
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: { journalId, refereeAssignment: { userId: refereeUserId } },
  });
  return ok(reviews);
}

async function getAllRefereeReviews({ userId }: { userId: number }) {
  const reviews = await prisma.refereeAssignment.findMany({
    where: {
      userId,
      // CompletedAssignment is only false if the referee drops out.
      OR: [{ completedAssignment: true }, { completedAssignment: null }],
    },
    include: {
      submission: {
        select: {
          id: true,
          author: { select: { id: true, name: true, orcid: true } },
        },
      },
      _count: {
        select: {
          reviews: true,
        },
      },
    },
  });
  return ok(reviews);
}

async function getAllRefereeReviewsBySubmission({ userId, submissionId }: { submissionId: number; userId: number }) {
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: {
      refereeAssignment: {
        userId,
        submissionId,
        OR: [{ completedAssignment: true }, { completedAssignment: null }],
      },
    },
    select: {
      id: true,
      recommendation: true,
      review: true,
      editorFeedback: true,
      authorFeedback: true,
      submittedAt: true,
      submission: {
        select: {
          id: true,
          author: { select: { id: true, name: true, orcid: true } },
        },
      },
    },
  });
  return ok(reviews);
}

async function getAuthorSubmissionReviews({ authorId, submissionId }: { authorId: number; submissionId: number }) {
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: {
      submission: {
        authorId,
        status: {
          not: {
            in: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW],
          },
        },
      },
      submissionId,
      submittedAt: { not: null },
    },
  });
  return ok(reviews);
}

async function getJournalReviewById({
  journalId,
  reviewId,
  completed,
}: {
  journalId: number;
  reviewId: number;
  completed?: boolean;
}) {
  const review = await prisma.journalSubmissionReview.findFirst({
    where: {
      id: reviewId,
      journalId,
      ...(completed !== undefined
        ? {
            submittedAt: { not: null },
            submission: { status: { notIn: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW] } },
          }
        : {}),
    },
    include: {
      refereeAssignment: {
        select: {
          referee: { select: { id: true, name: true, email: true } },
        },
      },
      submission: {
        select: {
          id: true,
          status: true,
          author: { select: { id: true, name: true, orcid: true } },
        },
      },
      journal: {
        select: {
          id: true,
          name: true,
          iconCid: true,
        },
      },
    },
  });
  return ok(review);
}

export {
  getSubmissionReviews,
  isSubmissionReviewed,
  checkRefereeSubmissionReview,
  saveReview,
  submitReview,
  getRefereeReviewsByJournalId,
  getAllRefereeReviews,
  getAllRefereeReviewsBySubmission,
  getAuthorSubmissionReviews,
  getJournalReviewById,
};
