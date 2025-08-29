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

export type GoogleAuthRequest = z.infer<typeof googleAuthSchema>;
