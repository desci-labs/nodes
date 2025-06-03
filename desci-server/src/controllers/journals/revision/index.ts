import {
  EditorRole,
  JournalEventLogAction,
  JournalRevisionStatus,
  ReviewDecision,
  SubmissionStatus,
} from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../../client.js';
import { sendError, sendSuccess } from '../../../core/api.js';
import { AuthenticatedRequest, ValidatedRequest } from '../../../core/types.js';
import { logger as parentLogger } from '../../../logger.js';
import {
  submissionApiSchema,
  submitRevisionSchema,
  revisionActionSchema,
  revisionApiSchema,
} from '../../../schemas/journals.schema.js';
import { JournalEventLogService } from '../../../services/journals/JournalEventLogService.js';
import { JournalManagementService } from '../../../services/journals/JournalManagementService.js';
import { JournalRefereeManagementService } from '../../../services/journals/JournalRefereeManagementService.js';
import { JournalRevisionService } from '../../../services/journals/JournalRevisionService.js';
import { journalSubmissionService } from '../../../services/journals/JournalSubmissionService.js';
import { getPublishedNodeVersionCount } from '../../../services/nodeManager.js';

const logger = parentLogger.child({
  module: 'Journals::RevisionController',
});

type SubmitRevisionRequest = ValidatedRequest<typeof submitRevisionSchema, AuthenticatedRequest>;
export const submitRevisionController = async (req: SubmitRevisionRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;
  const { dpid, version } = req.validatedData.body;
  const authorId = req.user.id;

  const submissionResult = await journalSubmissionService.getSubmissionById(submissionId);
  if (submissionResult.isErr()) {
    return sendError(res, 'Submission not found', 404);
  }
  const submission = submissionResult.value;

  if (submission.journalId !== journalId) {
    return sendError(res, 'Submission is not in the correct journal', 400);
  }

  if (submission.authorId !== authorId) {
    return sendError(res, 'User is not the author of the submission', 403);
  }

  if (submission.status !== SubmissionStatus.REVISION_REQUESTED) {
    return sendError(res, 'Submission is not expecting a revision', 400);
  }

  const node = await prisma.node.findFirst({
    where: {
      dpidAlias: dpid,
      ownerId: authorId,
    },
  });

  if (!node) {
    return sendError(res, 'Node not found', 404);
  }

  const nodeVersions = await getPublishedNodeVersionCount(node.id);

  if (version > nodeVersions) {
    return sendError(res, 'Invalid node version', 404);
  }

  if (submission.version >= version) {
    return sendError(res, 'Revision version is same as initial submission version', 404);
  }

  const revision = await JournalRevisionService.createRevision({
    submissionId: submission.id,
    dpid: submission.dpid,
    version,
    journalId,
  });

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVISION_SUBMITTED,
    userId: req.user.id,
    submissionId,
    details: { dpid, version },
  });

  // TODO: notify associate editor that a revision is submitted.

  return sendSuccess(res, revision.isOk() ? revision.value : null);
};

type RevisionActionRequest = ValidatedRequest<typeof revisionActionSchema, AuthenticatedRequest>;
export const revisionActionController = async (req: RevisionActionRequest, res: Response) => {
  const { journalId, submissionId, revisionId } = req.validatedData.params;
  const { decision } = req.validatedData.body;

  const submissionResult = await journalSubmissionService.getSubmissionById(submissionId);
  if (submissionResult.isErr()) {
    return sendError(res, 'Submission not found', 404);
  }
  const submission = submissionResult.value;

  if (submission.journalId !== journalId) {
    return sendError(res, 'Submission is not in the correct journal', 400);
  }

  if (submission.assignedEditorId !== req.user.id) {
    return sendError(res, 'User is not the assigned editor of the submission', 403);
  }

  if (submission.status !== SubmissionStatus.REVISION_REQUESTED) {
    return sendError(res, 'Submission is not expecting a revision', 400);
  }

  const revisionResult = await JournalRevisionService.getRevisionById(revisionId);
  if (revisionResult.isErr()) {
    return sendError(res, 'Revision not found', 404);
  }
  const revision = revisionResult.value;

  if (revision.status !== JournalRevisionStatus.PENDING) {
    return sendError(res, 'Revision is not pending', 400);
  }

  if (decision === 'accept') {
    await JournalRevisionService.updateRevisionStatus({ revisionId, status: JournalRevisionStatus.ACCEPTED });
  } else if (decision === 'reject') {
    await JournalRevisionService.updateRevisionStatus({ revisionId, status: JournalRevisionStatus.REJECTED });
  }

  await journalSubmissionService.updateSubmissionStatus(submissionId, SubmissionStatus.UNDER_REVIEW);

  await JournalEventLogService.log({
    journalId,
    action: JournalEventLogAction.REVISION_ACCEPTED,
    userId: req.user.id,
    submissionId,
    details: { revisionId },
  });

  // TODO: notify the author that the revision is accepted or rejected.
  // TODO: notify the referee that the revision is accepted or rejected.

  return sendSuccess(res, null);
};

type GetRevisionsRequest = ValidatedRequest<typeof submissionApiSchema, AuthenticatedRequest>;
export const getRevisionsController = async (req: GetRevisionsRequest, res: Response) => {
  const { journalId, submissionId } = req.validatedData.params;

  const userJournalRoleResult = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
  const isEditor = userJournalRoleResult.isOk();

  const checkAuthorResult = await journalSubmissionService.isSubmissionByAuthor(submissionId, req.user.id);
  const isAuthor = checkAuthorResult.isOk();

  const isAssignedRefereeResult = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    req.user.id,
    journalId,
  );
  const isAssignedReferee = isAssignedRefereeResult.isOk();

  if (!isEditor && !isAuthor && !isAssignedReferee) {
    return sendError(res, 'User is not authorized to get revisions', 403);
  }

  const submissionResult = await journalSubmissionService.getSubmissionById(submissionId);
  if (submissionResult.isErr()) {
    return sendError(res, 'Submission not found', 404);
  }
  const submission = submissionResult.value;

  if (submission.journalId !== journalId) {
    return sendError(res, 'Submission is not in the correct journal', 400);
  }

  const revisions = await JournalRevisionService.getRevisionsBySubmissionId(submission.id);

  return sendSuccess(res, revisions.isOk() ? revisions.value : []);
};

type GetRevisionByIdRequest = ValidatedRequest<typeof revisionApiSchema, AuthenticatedRequest>;
export const getRevisionByIdController = async (req: GetRevisionByIdRequest, res: Response) => {
  const { journalId, submissionId, revisionId } = req.validatedData.params;

  const userJournalRoleResult = await JournalManagementService.getUserJournalRole(journalId, req.user.id);
  const isEditor = userJournalRoleResult.isOk();

  const checkAuthorResult = await journalSubmissionService.isSubmissionByAuthor(submissionId, req.user.id);
  const isAuthor = checkAuthorResult.isOk();

  const isAssignedRefereeResult = await JournalRefereeManagementService.isRefereeAssignedToSubmission(
    submissionId,
    req.user.id,
    journalId,
  );
  const isAssignedReferee = isAssignedRefereeResult.isOk();

  if (!isEditor && !isAuthor && !isAssignedReferee) {
    return sendError(res, 'User is not authorized to get revisions', 403);
  }

  const submissionResult = await journalSubmissionService.getSubmissionById(submissionId);
  if (submissionResult.isErr()) {
    return sendError(res, 'Submission not found', 404);
  }
  const submission = submissionResult.value;

  if (submission.journalId !== journalId) {
    return sendError(res, 'Submission is not in the correct journal', 400);
  }

  const revisionResult = await JournalRevisionService.getRevisionById(revisionId);

  return sendSuccess(res, revisionResult.isOk() ? revisionResult.value : null);
};
