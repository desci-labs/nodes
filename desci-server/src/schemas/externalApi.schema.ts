import { z } from 'zod';

/**
 * Referee Recommender API Schemas
 */

// Presigned URL Request
export const generatePresignedUrlSchema = z.object({
  body: z.object({
    fileName: z.string().min(1, 'fileName is required'),
  }),
});

// Trigger Referee Recommendation Request
export const triggerRefereeRecommendationSchema = z.object({
  body: z.object({
    cid: z.string().min(1, 'CID is required'),
    external: z.boolean().optional().default(false),
    top_n_closely_matching: z.number().int().min(1).max(50).optional().default(5),
    number_referees: z.number().int().min(1).max(50).optional().default(10),
    force_run: z.boolean().optional().default(false),
    // Extended payload fields
    classify: z.boolean().optional(),
    coi_filter: z
      .object({
        co_author_overlap: z.boolean().optional(),
        institution_overlap: z.boolean().optional(),
        supervisor_supervisee_check: z.boolean().optional(),
      })
      .optional(),
    meta_data_only: z.boolean().optional(),
    exclude_fields: z.array(z.string()).optional(),
    exclude_works: z.array(z.string()).optional(),
    exclude_authors: z.array(z.string()).optional(),
  }),
});

// Get Referee Results Request
export const getRefereeResultsSchema = z.object({
  query: z.object({
    UploadedFileName: z.string().min(1, 'UploadedFileName is required'),
  }),
});

// Response types
export const presignedUrlResponseSchema = z.object({
  presignedUrl: z.string(),
  fileName: z.string(),
  expiresIn: z.number(),
});

export const triggerRefereeResponseSchema = z.object({
  execution_arn: z.string().optional(),
  uploaded_file_name: z.string(),
  api_version: z.string(),
  info: z.string(),
});

export const refereeResultsResponseSchema = z.object({
  status: z.string(),
  UploadedFileName: z.string(),
  result: z.object({
    data: z.object({
      paper_data: z
        .object({
          title: z.string().optional(),
          pub_year: z.number().optional(),
          abstract: z.string().optional(),
          raw_author_info: z.array(z.any()).optional(),
          author_ids: z.array(z.string()).optional(),
          author_indices: z.any().optional(),
        })
        .optional(),
      focal_authors_data: z.array(z.any()).optional(),
      referees: z
        .object({
          recommended: z.array(z.any()).optional(),
          recent_works: z.array(z.any()).optional(),
          fields: z
            .object({
              referee_fields: z.any().optional(),
              fields_info: z.any().optional(),
            })
            .optional(),
          topics: z
            .object({
              referee_topics: z.any().optional(),
              topics_info: z.any().optional(),
            })
            .optional(),
        })
        .optional(),
      evaluation: z
        .object({
          referee_discovery: z.any().optional(),
          conflic_of_interest: z.any().optional(),
          topic_similarity: z.any().optional(),
        })
        .optional(),
    }),
    runtime_data: z
      .object({
        cid: z.string().optional(),
        file_path: z.string().optional(),
        runtime: z.number().optional(),
        retained_after_coi: z.number().optional(),
        number_of_focal_authors: z.number().optional(),
      })
      .optional(),
  }),
});

// Type exports
export type GeneratePresignedUrlRequest = z.infer<typeof generatePresignedUrlSchema>;
export type TriggerRefereeRecommendationRequest = z.infer<typeof triggerRefereeRecommendationSchema>;
export type GetRefereeResultsRequest = z.infer<typeof getRefereeResultsSchema>;

export type PresignedUrlResponse = z.infer<typeof presignedUrlResponseSchema>;
export type TriggerRefereeResponse = z.infer<typeof triggerRefereeResponseSchema>;
export type RefereeResultsResponse = z.infer<typeof refereeResultsResponseSchema>;
