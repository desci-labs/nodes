import { FormResponseStatus, Prisma, SubmissionStatus } from '@prisma/client';
import { err, ok } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';

import { JournalFormService } from './JournalFormService.js';

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
    include: {
      refereeAssignment: {
        include: {
          referee: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!review) {
    return err('Review not found');
  }

  if (review.submittedAt) {
    return err('Review already submitted');
  }

  // Check and auto-submit all form responses for this referee assignment
  const formResponses = await prisma.journalFormResponse.findMany({
    where: {
      refereeAssignmentId: review.refereeAssignmentId,
    },
    include: {
      template: true,
    },
  });

  // Find any form responses that are still in DRAFT status
  const draftFormResponses = formResponses.filter((response) => response.status === FormResponseStatus.DRAFT);

  if (draftFormResponses.length > 0) {
    logger.info(
      { reviewId, draftResponseCount: draftFormResponses.length },
      'Auto-submitting draft form responses before review submission',
    );

    // Try to submit each draft form response
    const submissionResults = [];
    for (const draftResponse of draftFormResponses) {
      try {
        const submitResult = await JournalFormService.submitFormResponse(
          review.refereeAssignment.referee.id,
          draftResponse.id,
          draftResponse.formData as any,
        );

        if (submitResult.isErr()) {
          logger.warn(
            { reviewId, responseId: draftResponse.id, error: submitResult.error },
            'Failed to auto-submit form response',
          );

          // Check if it's a validation error
          if (submitResult.error.message.includes('Invalid inputs')) {
            const templateName = draftResponse.template?.name || `Template ${draftResponse.templateId}`;
            return err(`Form validation failed for "${templateName}": ${submitResult.error.message}`);
          }

          return err(
            `Failed to submit required form "${draftResponse.template?.name || 'Form'}": ${submitResult.error.message}`,
          );
        }

        submissionResults.push({ responseId: draftResponse.id, success: true });
      } catch (error) {
        logger.error(
          { reviewId, responseId: draftResponse.id, error },
          'Unexpected error during form response auto-submission',
        );
        return err(
          `Unexpected error submitting form "${draftResponse.template?.name || 'Form'}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    logger.info({ reviewId, submissionResults }, 'Successfully auto-submitted all draft form responses');
  }

  // Now proceed with the review submission
  const updateArgs = {
    recommendation: update.recommendation || review.recommendation,
    editorFeedback: update.editorFeedback || review.editorFeedback,
    authorFeedback: update.authorFeedback || review.authorFeedback,
    review: update.review || review.review,
  };

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

  const updatedRefereeAssignment = await prisma.refereeAssignment.update({
    where: { id: review.refereeAssignmentId },
    data: { completedAssignment: true, completedAt: new Date() },
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
      formResponse: {
        select: {
          id: true,
          templateId: true,
          status: true,
          formData: true,
          startedAt: true,
          submittedAt: true,
          updatedAt: true,
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              version: true,
              structure: true,
            },
          },
        },
      },
    },
  });
  return ok(review);
}

async function getReviewsByAssignment({
  assignmentId,
  userId,
  limit = 20,
  offset = 0,
}: {
  assignmentId: number;
  userId: number;
  limit?: number;
  offset?: number;
}) {
  // First verify the assignment exists and belongs to the user
  const assignment = await prisma.refereeAssignment.findFirst({
    where: {
      id: assignmentId,
      userId,
      // CompletedAssignment is only false if the referee drops out.
      OR: [{ completedAssignment: true }, { completedAssignment: null }],
    },
    include: {
      submission: {
        select: {
          id: true,
          status: true,
          author: { select: { id: true, name: true, orcid: true } },
          node: { select: { title: true } },
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

  if (!assignment) {
    return err('Assignment not found or not accessible');
  }

  // Get all reviews for this assignment
  const reviews = await prisma.journalSubmissionReview.findMany({
    where: {
      refereeAssignmentId: assignmentId,
    },
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
      formResponse: {
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              version: true,
              structure: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return ok({
    reviews,
    assignment,
  });
}

async function getAssignmentsBySubmission({
  submissionId,
  journalId,
  userId,
  limit = 20,
  offset = 0,
}: {
  submissionId: number;
  journalId: number;
  userId: number;
  limit?: number;
  offset?: number;
}) {
  // Get all assignments for this submission
  const assignments = await prisma.refereeAssignment.findMany({
    where: {
      submissionId,
      journalId,
      // // CompletedAssignment is only false if the referee drops out.
      // OR: [{ completedAssignment: true }, { completedAssignment: null }],
      // Commented this out, because I think we want to see assignments that were dropped out of.
    },
    skip: offset,
    take: limit,
    include: {
      referee: {
        select: {
          id: true,
          name: true,
          email: true,
          orcid: true,
        },
      },
      submission: {
        select: {
          id: true,
          status: true,
          author: { select: { id: true, name: true, orcid: true } },
          node: { select: { title: true } },
        },
      },
      reviews: {
        include: {
          formResponse: {
            include: {
              template: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  version: true,
                  structure: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
      JournalFormResponse: {
        include: {
          template: {
            select: {
              id: true,
              name: true,
              description: true,
              version: true,
              structure: true,
            },
          },
        },
        orderBy: {
          startedAt: 'desc',
        },
      },
    },
    orderBy: {
      assignedAt: 'desc',
    },
  });

  return ok(assignments);
}

async function getRefereeInvitationsBySubmission({ submissionId }: { submissionId: number }) {
  // Get all assignments for this submission
  const assignments = await prisma.refereeInvite.findMany({
    where: {
      submissionId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      accepted: true,
      acceptedAt: true,
      declined: true,
      declinedAt: true,
      createdAt: true,
      expiresAt: true,
      invitedById: true,
      relativeDueDateHrs: true,
      expectedFormTemplateIds: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return ok(assignments);
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
  getReviewsByAssignment,
  getAssignmentsBySubmission,
  getRefereeInvitationsBySubmission,
};
