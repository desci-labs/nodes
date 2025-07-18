import { z } from 'zod';

export enum DiscoverySource {
  GOOGLE_SEARCH = 'GOOGLE_SEARCH',
  COLLEAGUE_FRIEND = 'COLLEAGUE_FRIEND', // Recommended by a colleague or friend
  LINKEDIN = 'LINKEDIN',
  TWITTER = 'TWITTER',
  SHARED_PROJECT_DATASET = 'SHARED_PROJECT_DATASET', // Discovered via a shared project or dataset
  ACADEMIC_FORUM = 'ACADEMIC_FORUM', // Academic forum or community
  WEBINAR_EVENT = 'WEBINAR_EVENT', // Webinar or online event
  BLOG_ARTICLE = 'BLOG_ARTICLE',
  OTHER = 'OTHER',
}

// Native Zod enum derived from the TypeScript enum
export const DiscoverySourceSchema = z.nativeEnum(DiscoverySource);

/**
 * Schema for submitting the single-question user questionnaire.
 * If the user selects `OTHER`, they must provide the `other` field with a non-empty value.
 */
export const submitQuestionnaireSchema = z.object({
  body: z
    .object({
      discoverySource: DiscoverySourceSchema,
      other: z.string().trim().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.discoverySource === DiscoverySource.OTHER && (!data.other || data.other.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Please specify how you heard about us when selecting OTHER.',
          path: ['other'],
        });
      }
    }),
});

/**
 * Schema for updating marketing email consent preference.
 */
export const updateMarketingConsentSchema = z.object({
  body: z.object({
    receiveMarketingEmails: z.boolean().describe('Whether the user consents to receive marketing emails'),
  }),
});
