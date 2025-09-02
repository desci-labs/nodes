import { JournalRevisionStatus, SubmissionStatus } from '@prisma/client';
import { formatDate, isAfter } from 'date-fns';
import _ from 'lodash';

import { prisma } from '../../client.js';
import { logger } from '../../logger.js';

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
  const [journal, submissions, reviews, revisions] = await Promise.all([
    prisma.journal.findUnique({
      where: {
        id: journalId,
      },
    }),
    // get all submissions with optional date range
    prisma.journalSubmission.findMany({
      where: {
        journalId,
        ...(startDate && endDate
          ? {
              submittedAt: { gte: startDate, lte: endDate },
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
              submittedAt: { gte: startDate, lte: endDate },
            }
          : {}),
      },
    }),
  ]);

  const acceptedSubmissions = submissions.filter(
    (submission) => submission.acceptedAt !== null && submission.status === SubmissionStatus.ACCEPTED,
  );
  const acceptanceRate =
    submissions.length > 0 ? Math.round((acceptedSubmissions.length / submissions.length) * 100) : 0;

  // for all accpeted submissions calculate the average acceptance time
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
  const reviewCompletionRate = reviews.length > 0 ? Math.round((completedReviews.length / reviews.length) * 100) : 0;

  const averageReviewTime =
    completedReviews.length > 0
      ? completedReviews.reduce((acc, review) => {
          return acc + (review.submittedAt.getTime() - review.createdAt.getTime());
        }, 0) / completedReviews.length
      : 0;

  const journalStartedAt = journal.createdAt;
  const firstReview = reviews.find((review) => review.submittedAt !== null)?.createdAt;
  const timeToFirstReview = firstReview ? firstReview.getTime() - journalStartedAt.getTime() : null;

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
      { value: acceptanceRate > 0 ? `${acceptanceRate}%` : 'N/A', label: 'Acceptance Rate' },
      {
        value: averageTimeToAcceptance ? `${relativeTimeFormat(new Date(averageTimeToAcceptance).getTime())}` : 'N/A',
        label: 'Avg. Time to Acceptance',
      },
      { value: reviewCompletionRate > 0 ? `${reviewCompletionRate}%` : 'N/A', label: 'Review Completion Rate' },
      {
        value: timeToFirstReview ? `${toDays(new Date(timeToFirstReview).getTime())} Days` : 'N/A',
        label: 'Time to First Review',
      },
      {
        value: averageReviewTime ? `${relativeTimeFormat(new Date(averageReviewTime).getTime())}` : 'N/A',
        label: 'Avg. Review Time',
      },
      { value: overdueReviews.length || 'N/A', label: 'Overdue Reviews' },
      { value: revisions || 'N/A', label: 'Revisions/Article' },
    ],
  };
}

async function getPublicJournalAnalytics(journalId: number) {
  const [submissions, reviews] = await Promise.all([
    // get all submissions with optional date range
    prisma.journalSubmission.findMany({
      where: {
        journalId,
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
  ]);

  const acceptedSubmissions = submissions.filter(
    (submission) => submission.acceptedAt !== null && submission.status === SubmissionStatus.ACCEPTED,
  );

  // for all accpeted submissions calculate the average acceptance time
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

  const averageReviewTime =
    completedReviews.length > 0
      ? completedReviews.reduce((acc, review) => {
          return acc + (review.submittedAt.getTime() - review.createdAt.getTime());
        }, 0) / completedReviews.length
      : 0;

  return [
    {
      value: averageReviewTime ? `${relativeTimeFormat(new Date(averageReviewTime).getTime())}` : 'N/A',
      label: 'Average Review Turnaround',
    },
    {
      value: averageTimeToAcceptance ? `${relativeTimeFormat(new Date(averageTimeToAcceptance).getTime())}` : 'N/A',
      label: 'Average Decision Time',
    },
  ];
}

const toDays = (ms: number) => {
  return Math.round(ms / (1000 * 60 * 60 * 24));
};

export function relativeTimeFormat(ms: number) {
  const diff = Math.round(ms / 1000);

  const minute = 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const month = day * 30;
  const year = month * 12;

  if (diff < 30) {
    return 'just now';
  } else if (diff < minute) {
    return `${diff} Seconds`;
  } else if (diff === 2 * minute) {
    return '2 Minutes';
  } else if (diff < 2 * minute) {
    return 'A minute';
  } else if (diff < hour) {
    const sub = Math.floor(diff / minute);
    return sub + ` Minute${sub > 1 ? 's' : ''}`;
  } else if (Math.floor(diff / hour) === 1) {
    return '1 Hour';
  } else if (diff < day) {
    const sub = Math.floor(diff / hour);
    return sub + ` Hour${sub > 1 ? 's' : ''}`;
  } else if (diff < day * 2) {
    return '1 Day';
  } else if (diff < week) {
    const sub = Math.floor(diff / day);
    return sub + ' Days';
  } else if (diff < month) {
    const sub = Math.floor(diff / week);
    return `${sub} Week${sub > 1 ? 's' : ''}`;
  } else if (diff < year) {
    const sub = Math.floor(diff / month);
    return `${sub} Month${sub > 1 ? 's' : ''}`;
  } else {
    const sub = Math.floor(diff / year);
    return `${sub} Year${sub > 1 ? 's' : ''}`;
  }
}

export { getJournalAnalytics, getPublicJournalAnalytics };
