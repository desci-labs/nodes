import { Submissionstatus } from '@prisma/client';
import { Request, Response } from 'express';
import z from 'zod';

import { prisma } from '../../client.js';
import { BadRequestError, ForbiddenError } from '../../core/ApiError.js';
import { CreatedSuccessResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { RequestWithNode, RequestWithUser } from '../../middleware/authorisation.js';
import {
  createSubmissionSchema,
  getCommunitySubmissionsSchema,
  getSubmissionSchema,
  getUserSubmissionsSchema,
  updateSubmissionStatusSchema,
} from '../../routes/v1/communities/submissions-schema.js';
import { communityService } from '../../services/Communities.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const createSubmission = async (req: RequestWithNode, res: Response) => {
  const { nodeId, communityId } = req.body as z.infer<typeof createSubmissionSchema>['body'];

  // Check if community exists
  const community = await prisma.desciCommunity.findUnique({
    where: { id: parseInt(communityId.toString()) },
  });

  if (!community) {
    throw new BadRequestError('Community not found');
  }

  // Check if user is a member of the community
  //   const isMember = await prisma.communityMember.findFirst({
  //     where: {
  //       userId: req.user.id,
  //       communityId: communityId,
  //     },
  //   });

  //   if (!isMember) {
  //     throw new ForbiddenError('User is not a member of this community');
  //   }

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
  const { status } = req.query as z.infer<typeof getCommunitySubmissionsSchema>['query'];

  // Check if user is a member of the community
  const isMember = await prisma.communityMember.findFirst({
    where: {
      userId: req.user.id,
      communityId: Number(communityId),
    },
  });

  //   if (!isMember) {
  //     throw new ForbiddenError('User is not a member of this community');
  //   }

  // Get submissions
  const submissions = await communityService.getCommunitySubmissions({
    communityId: Number(communityId),
    status: isMember ? status : 'ACCEPTED',
  });

  new SuccessResponse(submissions).send(res);
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
  const { status } = req.body as z.infer<typeof updateSubmissionStatusSchema>['body'];

  // Get submission and check if it exists
  const submission = await prisma.communitySubmission.findUnique({
    where: { id: Number(submissionId) },
    include: { community: true },
  });

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
  const updatedSubmission = await communityService.updateSubmissionStatus(Number(submissionId), status);

  new SuccessResponse(updatedSubmission).send(res);
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

  new SuccessResponse(submission).send(res);
};
