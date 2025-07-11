import { AvailableUserActionLogTypes } from '@desci-labs/desci-models';
import { ActionType, Submissionstatus } from '@prisma/client';
import { Response } from 'express';
import { z } from 'zod';

import { prisma } from '../../client.js';
import { BadRequestError, ForbiddenError } from '../../core/ApiError.js';
import { CreatedSuccessResponse, SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import {
  createSubmissionSchema,
  getCommunitySubmissionsSchema,
  getSubmissionSchema,
  getUserSubmissionsSchema,
  rejectSubmissionSchema,
  updateSubmissionStatusSchema,
} from '../../routes/v1/communities/submissions-schema.js';
import { communityService } from '../../services/Communities.js';
import { EmailTypes, sendEmail } from '../../services/email/email.js';
import { saveInteraction } from '../../services/interactionLog.js';
import { getNodeDetails } from '../../services/node.js';
import { cachedGetDpidByUuid } from '../../utils/manifest.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

export const createSubmission = async (req: RequestWithNode, res: Response) => {
  const { nodeId, communityId } = req.body as z.infer<typeof createSubmissionSchema>['body'];

  // Check if community exists
  const community = await prisma.desciCommunity.findUnique({
    where: { id: parseInt(communityId.toString()) },
  });

  if (!community) {
    throw new BadRequestError('Community not found');
  }

  const nodeExists = await prisma.node.findFirst({ where: { uuid: nodeId } });
  if (!nodeExists) throw new BadRequestError('Node not found!');

  // Create submission
  const submission = await communityService.createSubmission({
    nodeId: ensureUuidEndsWithDot(nodeId),
    communityId: community.id,
    userId: req.user.id,
  });

  new CreatedSuccessResponse(submission).send(res);
};

export const getCommunitySubmissions = async (req: RequestWithUser, res: Response) => {
  const { communityId } = req.params as z.infer<typeof getCommunitySubmissionsSchema>['params'];
  const { status, limit, offset } = req.query as z.infer<typeof getCommunitySubmissionsSchema>['query'];

  // Check if user is a member of the community
  const isMember = req?.user?.id
    ? await prisma.communityMember.findFirst({
        where: {
          userId: req.user.id,
          communityId: Number(communityId),
        },
      })
    : false;

  // logger.trace({ isMember }, 'isMember');
  // Get submissions
  const queryLimit = limit ? Number(limit) : 10;
  const queryOffset = offset !== undefined ? Number(offset) : undefined;
  logger.trace({ queryLimit, queryOffset, isMember }, 'QUERY');
  const submissions = await communityService.getCommunitySubmissions({
    communityId: Number(communityId),
    status: isMember ? status : Submissionstatus.ACCEPTED,
    limit: queryLimit,
    offset: queryOffset,
  });
  logger.trace({ submissions }, 'SUBMISSIONS');

  // Get total count
  const totalCount = await communityService.getCommunitySubmissionsCount({
    communityId: Number(communityId),
    status: isMember ? status : Submissionstatus.ACCEPTED,
  });

  const data = await asyncMap(submissions, async (submission) => {
    const node = await getNodeDetails(submission.node);
    return { ...submission, node: { ...submission.node, ...node } };
  });
  new SuccessResponse({ submissions: data, meta: { totalCount, offset: queryOffset, limit: queryLimit } }).send(res);
};

export const getUserSubmissions = async (req: RequestWithUser, res: Response) => {
  const { userId } = req.params as z.infer<typeof getUserSubmissionsSchema>['params'];
  const { status } = req.query as z.infer<typeof getUserSubmissionsSchema>['query'];

  // Users can only view their own submissions
  if (req.user.id !== Number(userId)) {
    throw new ForbiddenError('Unauthorized to view these submissions');
  }

  const submissions = await communityService.getUserSubmissions(Number(userId), status);
  new SuccessResponse(submissions).send(res);
};

export const updateSubmissionStatus = async (req: RequestWithUser, res: Response) => {
  const { submissionId } = req.params as z.infer<typeof updateSubmissionStatusSchema>['params'];
  const { status, reason } = req.body as z.infer<typeof rejectSubmissionSchema>['body'];

  // Get submission and check if it exists
  const submission = await communityService.getSubmission(Number(submissionId));

  if (!submission) {
    throw new BadRequestError('Submission not found');
  }

  // Check if user is a community admin
  const isCommunityMember = await prisma.communityMember.findFirst({
    where: {
      userId: req.user.id,
      communityId: submission.communityId,
      //   role: 'ADMIN',
    },
  });

  if (!isCommunityMember) {
    throw new ForbiddenError('Only community members can update submission status');
  }

  // Update submission status
  const updatedSubmission = await communityService.updateSubmissionStatus(Number(submissionId), status, reason);

  if (status === Submissionstatus.REJECTED) {
    // log user action with reason
    saveInteraction({
      req,
      action: ActionType.USER_ACTION,
      data: {
        action: AvailableUserActionLogTypes.rejectCommunitySubmission,
        userId: req.user.id,
        submissionId,
        reason,
        status,
        submissionOwnerId: submission.userId,
      },
      userId: req.user.id,
    });

    const recipient = await prisma.user.findFirst({
      where: { id: submission.userId },
      select: { name: true, email: true },
    });
    const dpid = await cachedGetDpidByUuid(submission.nodeId);
    // send user rejection email
    await sendEmail({
      type: EmailTypes.RejectedSubmission,
      payload: {
        dpid: dpid.toString(),
        reason,
        recipient,
        communityName: submission.community.name,
        communitySlug: submission.community.slug,
        nodeVersion: submission.nodeVersion,
        nodeDpid: dpid.toString(),
      },
    });
  }

  const node = await getNodeDetails(submission.node);
  new SuccessResponse({ ...updatedSubmission, node: { ...updatedSubmission.node, ...node } }).send(res);
};

export const getSubmission = async (req: RequestWithUser, res: Response) => {
  const { submissionId } = req.params as z.infer<typeof getSubmissionSchema>['params'];

  const submission = await communityService.getSubmission(Number(submissionId));

  if (!submission) {
    throw new BadRequestError('Submission not found');
  }

  // Check if user is either the submitter or a community member
  const isSubmitter = submission.node.ownerId === req.user.id;
  const isCommunityMember = await prisma.communityMember.findFirst({
    where: {
      userId: req.user.id,
      communityId: submission.communityId,
    },
  });

  if (!isSubmitter && !isCommunityMember) {
    throw new ForbiddenError('Unauthorized to view this submission');
  }

  const node = await getNodeDetails(submission.node);

  new SuccessResponse({ ...submission, node: { ...submission.node, ...node } }).send(res);
};

export const cancelUserSubmission = async (req: RequestWithUser, res: Response) => {
  const { submissionId } = req.params as z.infer<typeof getSubmissionSchema>['params'];

  const submission = await communityService.getPendingUserSubmissionById(req.user.id, Number(submissionId));

  if (!submission) throw new ForbiddenError('You can only cancel pending submissions');

  await communityService.deleteSubmission(submission.id);

  new SuccessMessageResponse().send(res);
};
