import { ExternalApi, Feature, SentEmailType } from '@prisma/client';
import { ok, err, Result } from 'neverthrow';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { sendEmail } from '../email/email.js';
import { SciweaveEmailTypes } from '../email/sciweaveEmailTypes.js';
import { isUserStudentSciweave } from '../interactionLog.js';

import { FeatureLimitsService } from './FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'FeatureUsageService' });

export class LimitExceededError extends Error {
  constructor(
    public readonly currentUsage: number,
    public readonly useLimit: number,
  ) {
    super(`Feature limit exceeded: ${currentUsage}/${useLimit}`);
    this.name = 'LimitExceededError';
  }
}

export interface ConsumeUsageRequest {
  userId: number;
  feature: Feature;
  data?: unknown;
}

export interface ConsumeUsageResponse {
  usageId: number;
}

async function consumeUsage(request: ConsumeUsageRequest): Promise<Result<ConsumeUsageResponse, Error>> {
  try {
    const { userId, feature, data } = request;

    // Only support Research Assistant atm
    if (feature !== Feature.RESEARCH_ASSISTANT) {
      return err(new Error('Unsupported feature for this endpoint'));
    }

    // Ensure period rollover if needed
    const precheck = await FeatureLimitsService.checkFeatureLimit(userId, feature);
    if (precheck.isErr()) return err(precheck.error);

    const result = await prisma.$transaction(async (tx) => {
      // Ensure there is an active limit
      const activeLimit = await tx.userFeatureLimit.findFirst({
        where: { userId, feature, isActive: true },
      });
      if (!activeLimit) {
        throw new Error('Active feature limit not found');
      }

      // Compute current usage since the period start (Research Assistant only)
      const currentUsage = await tx.externalApiUsage.count({
        where: {
          userId,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          createdAt: { gte: activeLimit.currentPeriodStart },
        },
      });

      const useLimit = activeLimit.useLimit;
      if (useLimit !== null && currentUsage + 1 > useLimit) {
        return { type: 'limit', currentUsage, useLimit } as const;
      }

      // Check if this usage will hit the limit exactly (send warning email)
      const willHitLimit = useLimit !== null && currentUsage + 1 === useLimit;
      let shouldSendLimitEmail = false;

      if (willHitLimit) {
        // Check if we've ever sent either limit-reached email to the user
        const existingEmail = await tx.sentEmail.findFirst({
          where: {
            userId,
            emailType: {
              in: [SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL, SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED],
            },
          },
        });

        shouldSendLimitEmail = !existingEmail;
      }

      const created = await tx.externalApiUsage.create({
        data: {
          userId,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: data as any,
        },
      });

      return { type: 'created', usageId: created.id, shouldSendLimitEmail } as const;
    });

    if (result.type === 'limit') {
      return err(new LimitExceededError(result.currentUsage, result.useLimit));
    }

    // Send out-of-chats email if user just hit their limit (do this after successful transaction)
    if (result.shouldSendLimitEmail) {
      try {
        // Get user details for email
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, firstName: true, lastName: true },
        });

        if (user) {
          // Check if user identified as a student in the Sciweave questionnaire
          const isStudent = await isUserStudentSciweave(userId);

          // Choose the appropriate email type and template
          const emailType = isStudent
            ? SciweaveEmailTypes.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED
            : SciweaveEmailTypes.SCIWEAVE_OUT_OF_CHATS_INITIAL;

          const sentEmailType = isStudent
            ? SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED
            : SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL;

          // Send the email
          await sendEmail({
            type: emailType,
            payload: {
              email: user.email,
              firstName: user.firstName || undefined,
              lastName: user.lastName || undefined,
            },
          });

          // Record that we sent this email
          await prisma.sentEmail.create({
            data: {
              userId,
              emailType: sentEmailType,
              details: {
                feature: Feature.RESEARCH_ASSISTANT,
                triggeredByUsageId: result.usageId,
                isStudent,
              },
            },
          });

          logger.info({ userId, email: user.email, isStudent, emailType: sentEmailType }, 'Sent limit-reached email');
        }
      } catch (emailError) {
        // Don't fail the whole request if email fails
        logger.error({ emailError, userId }, 'Failed to send limit-reached email');
      }
    }

    return ok({ usageId: result.usageId });
  } catch (error) {
    logger.error({ error, request }, 'Failed to consume feature usage');
    return err(error instanceof Error ? error : new Error('Failed to consume feature usage'));
  }
}

export interface RefundUsageRequest {
  userId: number;
  feature: Feature;
  usageId: number;
}

async function refundUsage(request: RefundUsageRequest): Promise<Result<void, Error>> {
  try {
    const { userId, feature, usageId } = request;
    if (feature !== Feature.RESEARCH_ASSISTANT) {
      return err(new Error('Unsupported feature for this endpoint'));
    }
    const apiType = ExternalApi.RESEARCH_ASSISTANT;

    const deleted = await prisma.externalApiUsage.deleteMany({
      where: { id: usageId, userId, apiType },
    });

    if (deleted.count === 0) {
      return err(new Error('Usage entry not found for user/feature'));
    }

    logger.info({ userId, feature, usageId }, 'Refunded feature usage');
    return ok(undefined);
  } catch (error) {
    logger.error({ error, request }, 'Failed to refund feature usage');
    return err(error instanceof Error ? error : new Error('Failed to refund feature usage'));
  }
}

export const FeatureUsageService = {
  consumeUsage,
  refundUsage,
  LimitExceededError,
};
