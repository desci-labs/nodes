import { Feature, Period, PlanCodename, User, ExternalApi } from '@prisma/client';
import { subMonths } from 'date-fns';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, it, beforeEach, expect } from 'vitest';

import { prisma } from '../../../src/client.js';
import { SCIWEAVE_FREE_LIMIT } from '../../../src/config.js';
import { FeatureLimitsService } from '../../../src/services/FeatureLimits/FeatureLimitsService.js';
import { FeatureUsageService, LimitExceededError } from '../../../src/services/FeatureLimits/FeatureUsageService.js';
import { app } from '../../testApp.js';

describe('Research Assistant Metering', () => {
  let user: User;
  let authToken: string;

  beforeEach(async () => {
    // Clean up test data
    await prisma.$queryRaw`TRUNCATE TABLE "ExternalApiUsage" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "UserFeatureLimit" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    // Create test user
    user = await prisma.user.create({
      data: {
        email: 'research-assistant-test@desci.com',
        name: 'Research Assistant Test User',
      },
    });

    // Create auth token
    authToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1y' });
  });

  describe('FeatureLimitsService', () => {
    describe('checkFeatureLimit', () => {
      it('should create default FREE plan limits for new user', async () => {
        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.useLimit).toBe(SCIWEAVE_FREE_LIMIT); // FREE plan default
        expect(status.currentUsage).toBe(0);
        expect(status.remainingUses).toBe(SCIWEAVE_FREE_LIMIT);
        expect(status.planCodename).toBe(PlanCodename.FREE);
        expect(status.isWithinLimit).toBe(true);
      });

      it('should return current usage when user has consumed some uses', async () => {
        // First trigger feature limit creation by checking status
        await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        // Now create usage records (after feature limit exists)
        await prisma.externalApiUsage.createMany({
          data: [
            {
              userId: user.id,
              apiType: ExternalApi.RESEARCH_ASSISTANT,
              data: { query: 'test query 1' },
            },
            {
              userId: user.id,
              apiType: ExternalApi.RESEARCH_ASSISTANT,
              data: { query: 'test query 2' },
            },
          ],
        });

        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.currentUsage).toBe(2);
        expect(status.remainingUses).toBe(SCIWEAVE_FREE_LIMIT - 2);
        expect(status.isWithinLimit).toBe(true);
      });

      it('should show limit exceeded when usage equals limit', async () => {
        // First trigger feature limit creation
        await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        // Create usage records equal to limit (SCIWEAVE_FREE_LIMIT for FREE plan)
        const usageData = Array.from({ length: SCIWEAVE_FREE_LIMIT }, (_, i) => ({
          userId: user.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: `test query ${i + 1}` },
        }));
        await prisma.externalApiUsage.createMany({ data: usageData });

        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.currentUsage).toBe(SCIWEAVE_FREE_LIMIT);
        expect(status.remainingUses).toBe(0);
        expect(status.isWithinLimit).toBe(false); // SCIWEAVE_FREE_LIMIT >= SCIWEAVE_FREE_LIMIT, so not within limit
      });

      it('should handle unlimited plans (null limit)', async () => {
        // Update user to PRO plan (unlimited)
        await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.PRO,
          period: Period.MONTH,
          useLimit: null, // unlimited
        });

        // Create some usage
        await prisma.externalApiUsage.createMany({
          data: Array.from({ length: 100 }, (_, i) => ({
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: `test query ${i + 1}` },
          })),
        });

        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.useLimit).toBeNull();
        expect(status.currentUsage).toBe(100);
        expect(status.remainingUses).toBeNull();
        expect(status.isWithinLimit).toBe(true);
      });

      it('should reset usage for new period (month rollover)', async () => {
        // Create a user feature limit that started last month
        const lastMonth = subMonths(new Date(), 1);
        await prisma.userFeatureLimit.create({
          data: {
            userId: user.id,
            feature: Feature.RESEARCH_ASSISTANT,
            planCodename: PlanCodename.FREE,
            period: Period.MONTH,
            useLimit: SCIWEAVE_FREE_LIMIT,
            currentPeriodStart: lastMonth,
            isActive: true,
          },
        });

        // Create usage from last month (should not count)
        await prisma.externalApiUsage.create({
          data: {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'old query' },
            createdAt: lastMonth,
          },
        });

        // Create current usage
        await prisma.externalApiUsage.create({
          data: {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'current query' },
          },
        });

        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.currentUsage).toBe(1); // Only current month usage counts
        expect(status.remainingUses).toBe(SCIWEAVE_FREE_LIMIT - 1);
        expect(status.isWithinLimit).toBe(true);

        // Verify the period was reset
        const updatedLimit = await prisma.userFeatureLimit.findFirst({
          where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
        });
        expect(updatedLimit!.currentPeriodStart.getTime()).toBeGreaterThan(lastMonth.getTime());
      });

      it('should only count RESEARCH_ASSISTANT usage, not other API types', async () => {
        // First trigger feature limit creation
        await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        // Create mixed usage types
        await prisma.externalApiUsage.createMany({
          data: [
            {
              userId: user.id,
              apiType: ExternalApi.RESEARCH_ASSISTANT,
              data: { query: 'research query' },
            },
            {
              userId: user.id,
              apiType: ExternalApi.REFEREE_FINDER,
              data: { query: 'referee query' },
            },
          ],
        });

        const result = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        expect(result.isOk()).toBe(true);
        const status = result._unsafeUnwrap();
        expect(status.currentUsage).toBe(1); // Only RESEARCH_ASSISTANT counts
        expect(status.remainingUses).toBe(SCIWEAVE_FREE_LIMIT - 1);
      });
    });

    describe('updateFeatureLimits', () => {
      it('should create new feature limit when none exists', async () => {
        const result = await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.STARTER,
          period: Period.MONTH,
          useLimit: 25,
        });

        expect(result.isOk()).toBe(true);

        const limit = await prisma.userFeatureLimit.findFirst({
          where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
        });
        expect(limit!.planCodename).toBe(PlanCodename.STARTER);
        expect(limit!.useLimit).toBe(25);
      });

      it('should deactivate old limits and create new one', async () => {
        // Create initial limit
        await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.FREE,
          period: Period.MONTH,
          useLimit: SCIWEAVE_FREE_LIMIT,
        });

        // Update to new plan
        const result = await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.PRO,
          period: Period.MONTH,
          useLimit: null,
        });

        expect(result.isOk()).toBe(true);

        const activeLimits = await prisma.userFeatureLimit.findMany({
          where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
        });
        expect(activeLimits).toHaveLength(1);
        expect(activeLimits[0].planCodename).toBe(PlanCodename.PRO);
        expect(activeLimits[0].useLimit).toBeNull();

        const inactiveLimits = await prisma.userFeatureLimit.findMany({
          where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: false },
        });
        expect(inactiveLimits).toHaveLength(1);
      });
    });
  });

  describe('FeatureUsageService', () => {
    describe('consumeUsage', () => {
      it('should consume usage when within limits', async () => {
        const result = await FeatureUsageService.consumeUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          data: { query: 'test query' },
        });

        expect(result.isOk()).toBe(true);
        const response = result._unsafeUnwrap();
        expect(typeof response.usageId).toBe('number');

        // Verify usage was recorded
        const usage = await prisma.externalApiUsage.findUnique({
          where: { id: response.usageId },
        });
        expect(usage!.userId).toBe(user.id);
        expect(usage!.apiType).toBe(ExternalApi.RESEARCH_ASSISTANT);
      });

      it('should reject consumption when limit is exceeded', async () => {
        // First trigger feature limit creation
        await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        // Create usage records to reach limit (SCIWEAVE_FREE_LIMIT for FREE plan)
        const usageData = Array.from({ length: SCIWEAVE_FREE_LIMIT }, (_, i) => ({
          userId: user.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: `test query ${i + 1}` },
        }));
        await prisma.externalApiUsage.createMany({ data: usageData });

        const result = await FeatureUsageService.consumeUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          data: { query: 'should fail' },
        });

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBeInstanceOf(LimitExceededError);
        expect((error as LimitExceededError).currentUsage).toBe(SCIWEAVE_FREE_LIMIT);
        expect((error as LimitExceededError).useLimit).toBe(SCIWEAVE_FREE_LIMIT);
      });

      it('should allow consumption for unlimited plans', async () => {
        // Set unlimited plan
        await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.PRO,
          period: Period.MONTH,
          useLimit: null,
        });

        // Create many uses (more than normal limit)
        for (let i = 0; i < SCIWEAVE_FREE_LIMIT; i++) {
          const result = await FeatureUsageService.consumeUsage({
            userId: user.id,
            feature: Feature.RESEARCH_ASSISTANT,
            data: { query: `test query ${i + 1}` },
          });
          expect(result.isOk()).toBe(true);
        }

        // Verify all were recorded
        const totalUsage = await prisma.externalApiUsage.count({
          where: { userId: user.id, apiType: ExternalApi.RESEARCH_ASSISTANT },
        });
        expect(totalUsage).toBe(SCIWEAVE_FREE_LIMIT);
      });

      it('should reject unsupported features', async () => {
        const result = await FeatureUsageService.consumeUsage({
          userId: user.id,
          feature: Feature.REFEREE_FINDER,
          data: { query: 'test query' },
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().message).toContain('Unsupported feature');
      });
    });

    describe('refundUsage', () => {
      it('should refund usage successfully', async () => {
        // Consume usage first
        const consumeResult = await FeatureUsageService.consumeUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          data: { query: 'test query' },
        });
        const { usageId } = consumeResult._unsafeUnwrap();

        // Refund the usage
        const refundResult = await FeatureUsageService.refundUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          usageId,
        });

        expect(refundResult.isOk()).toBe(true);

        // Verify usage was deleted
        const usage = await prisma.externalApiUsage.findUnique({
          where: { id: usageId },
        });
        expect(usage).toBeNull();
      });

      it('should fail to refund non-existent usage', async () => {
        const result = await FeatureUsageService.refundUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          usageId: 99999,
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().message).toContain('Usage entry not found for user/feature');
      });

      it('should fail to refund usage from different user', async () => {
        // Create another user
        const otherUser = await prisma.user.create({
          data: { email: 'other@test.com', name: 'Other User' },
        });

        // Create usage for other user
        const usage = await prisma.externalApiUsage.create({
          data: {
            userId: otherUser.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'other user query' },
          },
        });

        // Try to refund as original user
        const result = await FeatureUsageService.refundUsage({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          usageId: usage.id,
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().message).toContain('Usage entry not found for user/feature');
      });

      it('should reject unsupported features', async () => {
        const result = await FeatureUsageService.refundUsage({
          userId: user.id,
          feature: Feature.REFEREE_FINDER,
          usageId: 1,
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().message).toContain('Unsupported feature');
      });
    });
  });

  describe('Internal API Endpoints', () => {
    beforeEach(() => {
      // Set internal service secret for tests
      process.env.INTERNAL_SERVICE_SECRET = 'test-secret';
    });

    describe('GET /v1/internal/feature-limits/status', () => {
      it('should return feature status for valid user', async () => {
        const res = await request(app)
          .get('/v1/internal/feature-limits/status')
          .set('X-Internal-Secret', 'test-secret')
          .query({
            userId: user.id,
            feature: Feature.RESEARCH_ASSISTANT,
          });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(Object.keys(res.body.data).sort()).toEqual(
          ['useLimit', 'currentUsage', 'remainingUses', 'planCodename', 'isWithinLimit'].sort(),
        );
        expect(res.body.data.useLimit).toBe(SCIWEAVE_FREE_LIMIT);
        expect(res.body.data.currentUsage).toBe(0);
        expect(res.body.data.isWithinLimit).toBe(true);
      });

      it('should reject requests without internal secret', async () => {
        const res = await request(app).get('/v1/internal/feature-limits/status').query({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
        });

        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
      });

      it('should reject requests with invalid secret', async () => {
        const res = await request(app)
          .get('/v1/internal/feature-limits/status')
          .set('X-Internal-Secret', 'wrong-secret')
          .query({
            userId: user.id,
            feature: Feature.RESEARCH_ASSISTANT,
          });

        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
      });

      it('should validate required parameters', async () => {
        const res = await request(app)
          .get('/v1/internal/feature-limits/status')
          .set('X-Internal-Secret', 'test-secret')
          .query({
            // Missing userId and feature
          });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
      });
    });

    describe('POST /v1/internal/meter/research-assistant', () => {
      it('should consume usage successfully', async () => {
        const res = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'increment',
            feature: Feature.RESEARCH_ASSISTANT,
            data: { query: 'test query' },
          });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.data.usageId).toBe('number');

        // Verify usage was recorded
        const usage = await prisma.externalApiUsage.findUnique({
          where: { id: res.body.data.usageId },
        });
        expect(usage!.userId).toBe(user.id);
      });

      it('should refund usage successfully', async () => {
        // First consume
        const consumeRes = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'increment',
            feature: Feature.RESEARCH_ASSISTANT,
            data: { query: 'test query' },
          });

        const usageId = consumeRes.body.data.usageId;

        // Then refund
        const refundRes = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'decrement',
            feature: Feature.RESEARCH_ASSISTANT,
            usageId,
          });

        expect(refundRes.status).toBe(200);
        expect(refundRes.body.ok).toBe(true);

        // Verify usage was deleted
        const usage = await prisma.externalApiUsage.findUnique({
          where: { id: usageId },
        });
        expect(usage).toBeNull();
      });

      it('should return 409 when limit exceeded', async () => {
        // Create usage records to reach limit using the service (which ensures proper timing)
        for (let i = 0; i < SCIWEAVE_FREE_LIMIT; i++) {
          const result = await FeatureUsageService.consumeUsage({
            userId: user.id,
            feature: Feature.RESEARCH_ASSISTANT,
            data: { query: `test query ${i + 1}` },
          });
          expect(result.isOk()).toBe(true);
        }

        const res = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'increment',
            feature: Feature.RESEARCH_ASSISTANT,
            data: { query: 'should fail' },
          });

        expect(res.status).toBe(409);
        expect(res.body.ok).toBe(false);
        expect(typeof res.body.message).toBe('string');
        expect(res.body.message).toContain('Feature limit exceeded');
      });

      it('should validate decrement requires usageId', async () => {
        const res = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'decrement',
            feature: Feature.RESEARCH_ASSISTANT,
            // Missing usageId
          });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
      });

      it('should reject invalid direction', async () => {
        const res = await request(app)
          .post('/v1/internal/meter/research-assistant')
          .set('X-Internal-Secret', 'test-secret')
          .send({
            userId: user.id,
            direction: 'invalid',
            feature: Feature.RESEARCH_ASSISTANT,
          });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
      });
    });
  });

  describe('Client-facing API Endpoint', () => {
    describe('GET /v1/services/ai/research-assistant/usage', () => {
      it('should return usage status for authenticated user', async () => {
        const res = await request(app)
          .get('/v1/services/ai/research-assistant/usage')
          .set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(Object.keys(res.body.data).sort()).toEqual(
          ['totalLimit', 'totalUsed', 'totalRemaining', 'planCodename', 'isWithinLimit'].sort(),
        );
        expect(res.body.data.totalLimit).toBe(SCIWEAVE_FREE_LIMIT);
        expect(res.body.data.totalUsed).toBe(0);
        expect(res.body.data.totalRemaining).toBe(SCIWEAVE_FREE_LIMIT);
        expect(res.body.data.isWithinLimit).toBe(true);
      });

      it('should return current usage when user has consumed some', async () => {
        // First trigger feature limit creation
        await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);

        // Create some usage
        await prisma.externalApiUsage.createMany({
          data: [
            {
              userId: user.id,
              apiType: ExternalApi.RESEARCH_ASSISTANT,
              data: { query: 'test query 1' },
            },
            {
              userId: user.id,
              apiType: ExternalApi.RESEARCH_ASSISTANT,
              data: { query: 'test query 2' },
            },
          ],
        });

        const res = await request(app)
          .get('/v1/services/ai/research-assistant/usage')
          .set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.totalUsed).toBe(2);
        expect(res.body.data.totalRemaining).toBe(SCIWEAVE_FREE_LIMIT - 2);
        expect(res.body.data.isWithinLimit).toBe(true);
      });

      it('should return 401 for unauthenticated requests', async () => {
        const res = await request(app).get('/v1/services/ai/research-assistant/usage');

        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
      });

      it('should handle unlimited plans correctly', async () => {
        // Set unlimited plan
        await FeatureLimitsService.updateFeatureLimits({
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.PRO,
          period: Period.MONTH,
          useLimit: null,
        });

        // Create some usage
        await prisma.externalApiUsage.create({
          data: {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'test query' },
          },
        });

        const res = await request(app)
          .get('/v1/services/ai/research-assistant/usage')
          .set('authorization', `Bearer ${authToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.totalLimit).toBeNull();
        expect(res.body.data.totalUsed).toBe(1);
        expect(res.body.data.totalRemaining).toBeNull();
        expect(res.body.data.isWithinLimit).toBe(true);
      });
    });
  });

  describe('Onboard Usage Controller', () => {
    describe('POST /v1/services/ai/research-assistant/onboard-usage', () => {
      it('should successfully onboard guest usage', async () => {
        const res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .set('authorization', `Bearer ${authToken}`)
          .send({ guestUsageCount: 3 });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.currentStatus.totalUsed).toBe(3);
        expect(res.body.data.currentStatus.totalRemaining).toBe(SCIWEAVE_FREE_LIMIT - 3);
        expect(res.body.data.currentStatus.isWithinLimit).toBe(true);

        // Verify the usage entries were created in the database
        const usageCount = await prisma.externalApiUsage.count({
          where: {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
          },
        });
        expect(usageCount).toBe(3);
      });

      it('should handle zero guest usage', async () => {
        const res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .set('authorization', `Bearer ${authToken}`)
          .send({ guestUsageCount: 0 });

        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.data.createdEntries).toBe(0);

        // Verify no usage entries were created
        const usageCount = await prisma.externalApiUsage.count({
          where: {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
          },
        });
        expect(usageCount).toBe(0);
      });

      it('should validate input parameters', async () => {
        // Test negative number
        let res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .set('authorization', `Bearer ${authToken}`)
          .send({ guestUsageCount: -1 });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);

        // Test number too high
        res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .set('authorization', `Bearer ${authToken}`)
          .send({ guestUsageCount: 1000 });

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);

        // Test missing parameter
        res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .set('authorization', `Bearer ${authToken}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.ok).toBe(false);
      });

      it('should require authentication', async () => {
        const res = await request(app)
          .post('/v1/services/ai/research-assistant/onboard-usage')
          .send({ guestUsageCount: 2 });

        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
      });
    });
  });

  describe('Period Rollover Integration Test', () => {
    it('should reset usage count when period rolls over', async () => {
      // Create a feature limit that started 2 months ago
      const twoMonthsAgo = subMonths(new Date(), 2);
      await prisma.userFeatureLimit.create({
        data: {
          userId: user.id,
          feature: Feature.RESEARCH_ASSISTANT,
          planCodename: PlanCodename.FREE,
          period: Period.MONTH,
          useLimit: SCIWEAVE_FREE_LIMIT,
          currentPeriodStart: twoMonthsAgo,
          isActive: true,
        },
      });

      // Create usage from various periods
      await prisma.externalApiUsage.createMany({
        data: [
          // Old usage (2 months ago) - should not count
          {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'very old query' },
            createdAt: twoMonthsAgo,
          },
          // Less old usage (1 month ago) - should not count
          {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'old query' },
            createdAt: subMonths(new Date(), 1),
          },
          // Current usage - should count
          {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'current query 1' },
          },
          {
            userId: user.id,
            apiType: ExternalApi.RESEARCH_ASSISTANT,
            data: { query: 'current query 2' },
          },
        ],
      });

      // Check status - should trigger period rollover
      const statusResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);
      expect(statusResult.isOk()).toBe(true);
      const status = statusResult._unsafeUnwrap();

      // Should only count current period usage
      expect(status.currentUsage).toBe(2);
      expect(status.remainingUses).toBe(SCIWEAVE_FREE_LIMIT - 2);
      expect(status.isWithinLimit).toBe(true);

      // Verify the period start was updated
      const updatedLimit = await prisma.userFeatureLimit.findFirst({
        where: { userId: user.id, feature: Feature.RESEARCH_ASSISTANT, isActive: true },
      });
      expect(updatedLimit!.currentPeriodStart.getTime()).toBeGreaterThan(twoMonthsAgo.getTime());
      expect(updatedLimit!.currentPeriodStart.getTime()).toBeLessThan(new Date().getTime());

      // Test API endpoint shows the same
      const res = await request(app)
        .get('/v1/services/ai/research-assistant/usage')
        .set('authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalUsed).toBe(2);
      expect(res.body.data.totalRemaining).toBe(SCIWEAVE_FREE_LIMIT - 2);
      expect(res.body.data.isWithinLimit).toBe(true);

      // Should still be able to consume more usage
      const consumeResult = await FeatureUsageService.consumeUsage({
        userId: user.id,
        feature: Feature.RESEARCH_ASSISTANT,
        data: { query: 'new query after rollover' },
      });
      expect(consumeResult.isOk()).toBe(true);

      // Final check - should show 3 uses
      const finalStatusResult = await FeatureLimitsService.checkFeatureLimit(user.id, Feature.RESEARCH_ASSISTANT);
      const finalStatus = finalStatusResult._unsafeUnwrap();
      expect(finalStatus.currentUsage).toBe(3);
      expect(finalStatus.remainingUses).toBe(SCIWEAVE_FREE_LIMIT - 3);
    });
  });
});
