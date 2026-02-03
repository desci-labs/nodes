import { z } from 'zod';

/**
 * Enum for Google auth app types
 */
export const GoogleAuthAppSchema = z.enum(['PUBLISH', 'SCIWEAVE']);

/**
 * Schema for Google OAuth login request
 */
export const googleAuthSchema = z.object({
  body: z.object({
    idToken: z.string().min(1, 'Google ID token is required'),
    dev: z.string().optional(),
    app: GoogleAuthAppSchema.optional().default('PUBLISH'),
  }),
});

export const appleLoginSchema = z.object({
  body: z.object({
    authorizationCode: z.string(),
    email: z.string().email().optional().nullable(),
    fullName: z.object({
      familyName: z.string().optional().nullable(),
      givenName: z.string().optional().nullable(),
      middleName: z.string().optional().nullable(),
      namePrefix: z.string().optional().nullable(),
      nameSuffix: z.string().optional().nullable(),
      nickname: z.string().optional().nullable(),
    }),
    identityToken: z.string(),
    realUserStatus: z.number(),
    state: z.string().optional().nullable(),
    user: z.string(),
  }),
});

export type GoogleAuthRequest = z.infer<typeof googleAuthSchema>;
