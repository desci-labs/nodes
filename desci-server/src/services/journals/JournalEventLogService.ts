import { EditorRole, JournalEventLogAction } from '@prisma/client';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';

const logger = parentLogger.child({
  module: 'Journals::JournalInviteService',
});

// Centrally define a bundled list of actions for a specific audience
// We often wouldn't want all logs being sent to a client, so we can use this to scope the logs
const logAudience = {
  [EditorRole.CHIEF_EDITOR]: {
    // Journal Management Logs
    [JournalEventLogAction.EDITOR_INVITED]: true,
    [JournalEventLogAction.EDITOR_ACCEPTED_INVITE]: true,
    [JournalEventLogAction.EDITOR_DECLINED_INVITE]: true,
  },
  EditorSubmissionEvents: {
    // Logs an associate editor would see on a submission
    [JournalEventLogAction.REFEREE_INVITED]: true,
    [JournalEventLogAction.REFEREE_ACCEPTED]: true,
    [JournalEventLogAction.REFEREE_DECLINED]: true,
    [JournalEventLogAction.REFEREE_REASSIGNED]: true,
  },
  SubmissionEvents: {
    // Logs a user woudl see on their submissions
    [JournalEventLogAction.SUBMISSION_CREATED]: true,
    [JournalEventLogAction.SUBMISSION_ACCEPTED]: true,
    [JournalEventLogAction.SUBMISSION_REJECTED]: true,
    [JournalEventLogAction.REVISION_REQUESTED]: true,
    [JournalEventLogAction.REVISION_SUBMITTED]: true,
    [JournalEventLogAction.DOI_MINTED]: true,
    [JournalEventLogAction.REVIEW_SUBMITTED]: true,
  },
  BillingEvents: {},
};

/**
 * A helper to combine different logAudiences into a single array of actions
 * @example
 * const actions = filterLogs([logAudience.ChiefEditor, logAudience.AssociateEditor]);
 * @returns an array of unique actions, ready to use in a prisma query.
 */
const filterLogs = (audience: (typeof logAudience)[keyof typeof logAudience][]) => {
  const actions = audience.flatMap((audienceObj) =>
    Object.keys(audienceObj).filter((key) => audienceObj[key as keyof typeof audienceObj]),
  ) as JournalEventLogAction[];

  const uniqueActions = [...new Set(actions)];

  return uniqueActions;
};

interface LogJournalEventArgs {
  journalId: number;
  action: JournalEventLogAction;
  userId?: number; // User who performed the action
  submissionId?: number;
  details?: Record<string, any>;
}

async function logJournalEvent({ journalId, action, userId, submissionId, details }: LogJournalEventArgs) {
  try {
    const event = await prisma.journalEventLog.create({
      data: {
        journalId,
        action,
        userId,
        submissionId,
        details,
      },
    });
    return event;
  } catch (error) {
    logger.error({ error, journalId, action, userId, submissionId, details }, 'Failed to log journal event');
    throw error;
  }
}

async function getSubmissionEventsForEditor(submissionId: number) {
  const filteredActions = filterLogs([logAudience.EditorSubmissionEvents, logAudience.SubmissionEvents]);

  const events = await prisma.journalEventLog.findMany({
    where: {
      submissionId,
      action: { in: filteredActions },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  return events;
}

export const JournalEventLogService = {
  log: logJournalEvent,
  getSubmissionEventsForEditor,
};
