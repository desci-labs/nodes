import { Submissionstatus } from '@prisma/client';
import { z } from 'zod';

// Schema for creating a new submission
export const createSubmissionSchema = z.object({
  body: z.object({
    // uuid identifier of the node
    nodeId: z.string(),
    communityId: z.coerce.number(),
  }),
});

// Schema for getting community submissions
export const getCommunitySubmissionsSchema = z.object({
  params: z.object({
    communityId: z.coerce.number(),
  }),
  query: z.object({
    status: z.enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED]).optional(),
  }),
});

// Schema for getting user submissions
export const getUserSubmissionsSchema = z.object({
  params: z.object({
    userId: z.string(),
  }),
  query: z.object({
    status: z.enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED]).optional(),
  }),
});

// Schema for updating submission status
export const updateSubmissionStatusSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number(),
  }),
  body: z.object({
    status: z.enum([Submissionstatus.PENDING, Submissionstatus.ACCEPTED, Submissionstatus.REJECTED]),
  }),
});

// Schema for getting a single submission
export const getSubmissionSchema = z.object({
  params: z.object({
    submissionId: z.coerce.number(),
  }),
});
