import { Submissionstatus } from '@prisma/client';
import 'zod-openapi/extend';
import { z } from 'zod';

// Schema for creating a new submission
export const createSubmissionSchema = z.object({
  body: z.object({
    // uuid identifier of the node
    nodeId: z.string().describe('The unique identifier (UUID) of the research node being submitted'),
    communityId: z.coerce.number().describe('The ID of the community to submit the research node to'),
  }),
});

// Schema for getting community submissions
export const getCommunitySubmissionsSchema = z.object({
  params: z.object({
    communityId: z.coerce.number().describe('The ID of the community to get submissions from'),
  }),
  query: z.object({
    status: z
      .enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED])
      .optional()
      .describe('Filter submissions by their status (pending, accepted, or rejected)'),
  }),
});

// Schema for getting user submissions
export const getUserSubmissionsSchema = z.object({
  params: z.object({
    userId: z.string().describe('The ID of the user to get submissions for'),
  }),
  query: z.object({
    status: z
      .enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED])
      .optional()
      .describe('Filter submissions by their status (pending, accepted, or rejected)'),
  }),
});

// Schema for updating submission status
export const updateSubmissionStatusSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number().describe('The ID of the submission to update'),
  }),
  body: z.object({
    status: z
      .enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED])
      .describe('The new status to set for the submission'),
  }),
});

// Schema for getting a single submission
export const getSubmissionSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number().describe('The ID of the submission to retrieve'),
  }),
});

// Schema for rejecting a submission
export const rejectSubmissionSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number().describe('The ID of the submission to reject'),
  }),
  body: z.object({
    reason: z.string().optional().describe('Optional reason for rejecting the submission'),
    status: z
      .enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED])
      .describe('The status to set for the submission (typically REJECTED)'),
  }),
});
