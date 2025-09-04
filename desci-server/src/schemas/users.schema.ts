import { z } from 'zod';

export enum UserRole {
  STUDENT = 'STUDENT',
  SCIENTIST_RESEARCHER = 'SCIENTIST_RESEARCHER',
  CLINICIAN_HEALTHCARE = 'CLINICIAN_HEALTHCARE',
  LEGAL_PROFESSIONAL = 'LEGAL_PROFESSIONAL',
  EDUCATOR_TEACHER = 'EDUCATOR_TEACHER',
  OTHER_PROFESSIONAL = 'OTHER_PROFESSIONAL',
  PERSONAL_USE = 'PERSONAL_USE',
}

// Native Zod enum derived from the UserRole enum
export const UserRoleSchema = z.nativeEnum(UserRole);

export enum DiscoverySource {
  GOOGLE_SEARCH = 'GOOGLE_SEARCH',
  COLLEAGUE_FRIEND = 'COLLEAGUE_FRIEND', // Recommended by a colleague or friend
  LINKEDIN = 'LINKEDIN',
  TWITTER = 'TWITTER', // X (Twitter)
  SHARED_PROJECT_DATASET = 'SHARED_PROJECT_DATASET', // Discovered via a shared project or dataset
  ACADEMIC_FORUM = 'ACADEMIC_FORUM', // Academic forum or community
  WEBINAR_EVENT = 'WEBINAR_EVENT', // Webinar or online event
  BLOG_ARTICLE = 'BLOG_ARTICLE',
  YOUTUBE = 'YOUTUBE',
  TIKTOK = 'TIKTOK',
  OTHER_SOCIAL_MEDIA = 'OTHER_SOCIAL_MEDIA', // - Other Social Media (Facebook, Instagram, etc.)
  OTHER = 'OTHER',
}

// Native Zod enum derived from the TypeScript enum
export const DiscoverySourceSchema = z.nativeEnum(DiscoverySource);

/**
 * Schema for submitting the user questionnaire including role and discovery source.
 * The discoverySource can be either a predefined enum value or a custom string starting with 'OTHER - '.
 */
export const submitQuestionnaireSchema = z.object({
  body: z.object({
    role: UserRoleSchema,
    discoverySource: z.string().refine(
      (value) => {
        // Allow predefined enum values
        if (Object.values(DiscoverySource).includes(value as DiscoverySource)) {
          return true;
        }
        // Allow custom strings that start with 'OTHER - ' and have additional content
        if (value.startsWith('OTHER - ') && value.length > 8) {
          return true;
        }
        return false;
      },
      {
        message:
          'Invalid discovery source. Must be a valid option or start with "OTHER - " followed by your specification.',
      },
    ),
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

/**
 * Schema for exporting marketing consent users.
 */
export const exportMarketingConsentSchema = z.object({
  query: z.object({
    format: z
      .enum(['csv', 'xlsx'])
      .optional()
      .default('csv')
      .describe('Export format - csv (default) or xlsx for Excel'),
  }),
});
