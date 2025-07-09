import { JournalRevisionStatus, SubmissionStatus } from '@prisma/client';
import { formatDate, isAfter } from 'date-fns';
import _ from 'lodash';

import { prisma } from '../../client.js';

export interface JournalAnalytics {
  overview: { value: number; label: string }[];
  chartData: { month: string; totalSubmissions: number }[];
}

async function getJournalAnalytics({
  journalId,
  startDate,
  endDate,
}: {
  journalId: number;
  startDate: Date | null;
  endDate: Date | null;
}) {
  const [submissions, reviews, revisions] = await Promise.all([
    // get all submissions with optional date range
    prisma.journalSubmission.findMany({
      where: {
        journalId,
        ...(startDate && endDate
          ? {
              submittedAt: { gte: startDate, lt: endDate },
            }
          : {}),
      },
      orderBy: {
        submittedAt: 'desc',
      },
    }),

    // get all reviews with optional date range
    prisma.journalSubmissionReview.findMany({
      where: {
        submission: {
          journalId,
        },
        ...(startDate && endDate
          ? {
              submittedAt: { gte: startDate, lt: endDate },
            }
          : {}),
      },
      include: {
        submission: {
          select: {
            status: true,
          },
        },
        refereeAssignment: {
          select: {
            dueDate: true,
          },
        },
      },
    }),

    // count the number of pending revisions with optional date range
    prisma.journalSubmissionRevision.count({
      where: {
        journalId,
        status: JournalRevisionStatus.PENDING,
        ...(startDate && endDate
          ? {
              submittedAt: { gte: startDate, lt: endDate },
            }
          : {}),
      },
    }),
  ]);

  const acceptedSubmissions = submissions.filter((submission) => submission.status === SubmissionStatus.ACCEPTED);
  const acceptanceRate =
    submissions.length > 0 ? Math.round((acceptedSubmissions.length / submissions.length) * 100) : 0;

  const averageTimeToAcceptance =
    acceptedSubmissions.length > 0
      ? acceptedSubmissions.reduce((acc, submission) => {
          return acc + (submission.acceptedAt.getTime() - submission.submittedAt.getTime());
        }, 0) / acceptedSubmissions.length
      : 0;

  const completedReviews = reviews.filter(
    (review) =>
      review.submittedAt !== null &&
      ([SubmissionStatus.ACCEPTED, SubmissionStatus.REJECTED] as SubmissionStatus[]).includes(review.submission.status),
  );
  const reviewCompletionRate =
    completedReviews.length > 0 ? Math.round((completedReviews.length / reviews.length) * 100) : 0;

  const averageReviewTime =
    completedReviews.length > 0
      ? completedReviews.reduce((acc, review) => {
          return acc + (review.submittedAt.getTime() - review.createdAt.getTime());
        }, 0) / completedReviews.length
      : 0;

  const timeToFirstReview = reviews.find((review) => review.submittedAt !== null)?.createdAt;

  const overdueReviews = reviews.filter(
    (review) =>
      review.submittedAt === null &&
      review.refereeAssignment.dueDate !== null &&
      isAfter(new Date(), review.refereeAssignment.dueDate),
  );

  const groupedSubmissions = _.groupBy(submissions, (submission) =>
    formatDate(new Date(submission.submittedAt), 'MMM'),
  );
  const chartData = Object.entries(groupedSubmissions)
    .map(([month, submissions]) => ({
      month,
      totalSubmissions: submissions.length,
      sortKey: submissions[0].submittedAt.getTime(),
    }))
    .sort((a, b) => a.sortKey - b.sortKey);

  return {
    chartData,
    overview: [
      { value: submissions.length, label: 'Total Submissions' },
      { value: acceptanceRate, label: 'Acceptance Rate' },
      { value: averageTimeToAcceptance, label: 'Avg. Time to Acceptance' },
      { value: reviewCompletionRate, label: 'Review Completion Rate' },
      {
        value: timeToFirstReview ? Math.round(toDays(timeToFirstReview.getTime())) : 0,
        label: 'Time to First Review',
      },
      { value: Math.round(toDays(averageReviewTime)), label: 'Avg. Review Time' },
      { value: overdueReviews.length, label: 'Overdue Reviews' },
      { value: revisions, label: 'Revisions/Article' },
    ],
  };
}

const toDays = (ms: number) => {
  return ms / (1000 * 60 * 60 * 24);
};

export { getJournalAnalytics };
