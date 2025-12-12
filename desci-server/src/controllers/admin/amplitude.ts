import 'zod-openapi/extend';
import { Response } from 'express';
import z from 'zod';

import { BadRequestError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { ValidatedRequest } from '../../core/types.js';
import { AmplitudeAppType, updateUserProperties, UserProperties } from '../../lib/Amplitude.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithUser } from '../../middleware/authorisation.js';

const logger = parentLogger.child({ module: 'ADMIN::AmplitudeController' });

const AMPLITUDE_PROFILE_ENDPOINT = 'https://profile-api.amplitude.com/v1/userprofile';

/**
 * Schema for updating user identity on Amplitude (Sciweave)
 * Based on Amplitude Identify API: https://amplitude.com/docs/apis/analytics/identify
 */
export const updateAmplitudeIdentitySchema = z.object({
  params: z.object({
    userId: z.string().min(1).openapi({ description: 'The user ID to update on Amplitude', example: '123' }),
  }),
  body: z.object({
    deviceId: z.string().optional().openapi({ description: 'The device ID to update on Amplitude', example: '123' }),
    properties: z.record(z.string(), z.unknown()).openapi({
      description: 'User properties to set on Amplitude. Supports any key-value pairs.',
      example: {
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        role: 'researcher',
        plan_type: 'premium',
        receive_marketing_updates: true,
      },
    }),
  }),
});

export type UpdateAmplitudeIdentityRequest = ValidatedRequest<typeof updateAmplitudeIdentitySchema, RequestWithUser>;

interface AmplitudeUserProfile {
  userData?: {
    user_id?: string;
    device_id?: string;
    amp_props?: Record<string, unknown>;
    cohort_ids?: string[];
  };
}

/**
 * Fetch user profile from Amplitude User Profile API
 * @see https://amplitude.com/docs/apis/analytics/user-profile
 */
async function fetchAmplitudeUserProfile(userId: string): Promise<Record<string, unknown> | null> {
  const secretKey = '7e596fee3c780cb811237cc0396eaa24'; // process.env.AMPLITUDE_SECRET_KEY_SCIWEAVE;

  if (!secretKey) {
    logger.warn(
      { fn: 'fetchAmplitudeUserProfile' },
      'AMPLITUDE_SECRET_KEY_SCIWEAVE not set, skipping profile verification',
    );
    return null;
  }

  try {
    const url = `${AMPLITUDE_PROFILE_ENDPOINT}?user_id=${encodeURIComponent(userId)}&get_amp_props=true`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Api-Key ${secretKey}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { fn: 'fetchAmplitudeUserProfile', userId, status: response.status, error: errorText },
        'Failed to fetch Amplitude user profile',
      );
      return null;
    }

    const profileData: AmplitudeUserProfile = await response.json();
    return profileData.userData?.amp_props || null;
  } catch (error) {
    logger.error({ fn: 'fetchAmplitudeUserProfile', userId, error }, 'Error fetching Amplitude user profile');
    return null;
  }
}

/**
 * Update user identity/properties on Amplitude (Sciweave)
 *
 * This endpoint allows admins to update user properties on Amplitude
 * without triggering an event. Useful for syncing user data or correcting
 * user properties.
 *
 * @see https://amplitude.com/docs/apis/analytics/identify
 * @see https://amplitude.com/docs/apis/analytics/user-profile
 */
export const updateAmplitudeIdentity = async (req: UpdateAmplitudeIdentityRequest, res: Response) => {
  const { userId } = req.params;
  const { properties, deviceId } = req.body;

  logger.info(
    { fn: 'updateAmplitudeIdentity', userId, adminUser: req.user?.email, properties },
    `Updating Amplitude identity for user ${userId}`,
  );

  const result = await updateUserProperties({
    userId,
    deviceId,
    properties: properties as UserProperties,
    appType: AmplitudeAppType.SCIWEAVE,
  });

  if (result.isErr()) {
    logger.error({ fn: 'updateAmplitudeIdentity', userId, error: result.error }, 'Failed to update Amplitude identity');
    throw new BadRequestError(result.error);
  }

  logger.info({ fn: 'updateAmplitudeIdentity', userId }, 'Successfully updated Amplitude identity');

  // Fetch user profile to verify the update
  //   const currentProperties = await fetchAmplitudeUserProfile(userId);

  return new SuccessResponse({
    message: `Successfully updated user ${userId} properties on Amplitude (sciweave)`,
    userId,
    properties,
    // currentProperties,
    result: result.value,
  }).send(res);
};
