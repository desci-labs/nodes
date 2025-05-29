import { Prisma, SubmissionStatus } from '@prisma/client';
import { err, ok } from 'neverthrow';

import { prisma } from '../../client.js';

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
  refereeId,
  submissionId,
}: {
  journalId: number;
  refereeId: number;
  submissionId: number;
}) {
  const review = await prisma.journalSubmissionReview.findFirst({
    where: { journalId, submissionId, refereeAssignmentId: refereeId },
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
  refereeId,
  update,
  reviewId,
}: {
  journalId: number;
  submissionId: number;
  refereeId: number;
  update: SaveReviewUpdateFields;
  reviewId?: number;
}) {
  let review = await prisma.journalSubmissionReview.findFirst({
    where: {
      ...(reviewId !== undefined ? { id: reviewId } : {}),
      refereeAssignmentId: refereeId,
      submissionId,
      journalId,
      submittedAt: null,
    },
  });

  if (reviewId !== undefined && review === null) {
    return err('Review not found');
  }

  if (review) {
    if (review.refereeAssignmentId !== refereeId) {
      return err('Review not found');
    }

    review = await prisma.journalSubmissionReview.update({
      where: { id: review.id },
      data: {
        ...update,
        refereeAssignmentId: refereeId,
        submissionId,
        journalId,
      },
    });
  } else {
    review = await prisma.journalSubmissionReview.create({
      data: {
        ...update,
        refereeAssignmentId: refereeId,
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
async function getRefereeReviewsByJournalId({ refereeId, journalId }: { refereeId: number; journalId: number }) {
  // todo: check if referee is assigned to the journal
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: { journalId, refereeAssignment: { refereeId } },
  });
  return ok(reviews);
}

async function getAllRefereeReviews({ refereeId }: { refereeId: number }) {
  const reviews = await prisma.refereeAssignment.findMany({
    where: {
      refereeId,
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

async function getAllRefereeReviewsBySubmission({
  refereeId,
  submissionId,
}: {
  submissionId: number;
  refereeId: number;
}) {
  const reviews = await prisma.refereeAssignment.findMany({
    where: {
      refereeId,
      submissionId,
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
      reviews: {
        select: {
          id: true,
          submittedAt: true,
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
        status: { not: { in: [SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW] } },
      },
      submissionId,
      submittedAt: { not: null },
    },
  });
  return ok(reviews);
}

async function getJournalReviewById({ journalId, reviewId }: { journalId: number; reviewId: number }) {
  const review = await prisma.journalSubmissionReview.findFirst({
    where: { id: reviewId, journalId },
    include: {
      refereeAssignment: {
        select: {
          referee: { select: { id: true, name: true, email: true } },
        },
      },
      submission: {
        select: {
          id: true,
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
