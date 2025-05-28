import { Prisma } from '@prisma/client';
import { err, ok } from 'neverthrow';

import { prisma } from '../../client.js';

export type JournalReview = Record<string, any>[];

// function to get submission reviews (submissionId)
export async function getSubmissionReviews({
  submissionId,
  offset = 0,
  limit = 20,
}: {
  submissionId: number;
  limit: number;
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
export async function isSubmissionReviewed(submissionId: number) {
  const reviews = await getSubmissionReviews({ submissionId, offset: 0, limit: 1 });
  return reviews.length > 0;
}

export async function saveReview({
  submissionId,
  refereeId,
  update,
}: {
  journalId: number;
  submissionId: number;
  refereeId: number;
  update: Prisma.JournalSubmissionReviewUncheckedCreateInput;
}) {
  let review = await prisma.journalSubmissionReview.findFirst({
    where: { refereeAssignmentId: refereeId, submissionId },
  });

  if (review) {
    await prisma.journalSubmissionReview.update({
      where: { id: review.id },
      data: {
        ...review,
        ...update,
      },
    });
  } else {
    review = await prisma.journalSubmissionReview.create({
      data: {
        ...update,
        refereeAssignmentId: refereeId,
        submissionId,
      },
    });
  }
}

// function to submit review
export async function submitReview({
  submissionId,
  refereeId,
  update,
}: {
  journalId: number;
  submissionId: number;
  refereeId: number;
  update: Prisma.JournalSubmissionReviewUncheckedCreateInput;
}) {
  // todo: check if recommendation and review are non empty

  const review = await prisma.journalSubmissionReview.findFirst({
    where: { refereeAssignmentId: refereeId, submissionId },
  });

  if (!review) {
    return err('Review not found');
  }

  if (review.submittedAt) {
    return err('Review already submitted');
  }

  const updateArgs = { ...review, ...update };
  if (!updateArgs.recommendation || !updateArgs.review) {
    return err('Recommendation and review are required');
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
