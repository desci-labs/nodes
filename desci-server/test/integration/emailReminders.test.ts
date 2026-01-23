import { ActionType, ExternalApi, Feature, Period, PlanCodename, SentEmailType, User } from '@prisma/client';
import { subDays, subHours } from 'date-fns';
import { describe, it, beforeEach, expect } from 'vitest';

import { prisma } from '../../src/client.js';
import { UserRole } from '../../src/schemas/users.schema.js';
import {
  checkSciweave14DayInactivity,
  checkOutOfChatsFollowUp,
  checkStudentDiscountFollowUp,
} from '../../src/workers/emailReminderConfig.js';
import { clearDryRunEmails } from '../../src/workers/emailDryRun.js';

/**
 * Integration tests for email reminder handlers
 *
 * These tests verify that handlers correctly identify users who should receive
 * automated emails based on specific criteria. All tests run in DRY_RUN mode
 * to avoid actually sending emails.
 */

// Set DRY_RUN mode for all tests
process.env.EMAIL_REMINDER_DRY_RUN = 'true';

describe('Email Reminder Handlers', () => {
  let testUser: User;

  beforeEach(async () => {
    // Clean up test data
    await prisma.$queryRaw`TRUNCATE TABLE "SentEmail" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "ExternalApiUsage" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "UserFeatureLimit" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "InteractionLog" CASCADE;`;
    await prisma.$queryRaw`TRUNCATE TABLE "User" CASCADE;`;

    // Clear dry run records
    clearDryRunEmails();

    // Create base test user
    testUser = await prisma.user.create({
      data: {
        email: 'test-email-reminders@desci.com',
        name: 'Email Test User',
        firstName: 'Email',
        lastName: 'Test',
        receiveSciweaveMarketingEmails: true, // Opted in to marketing
      },
    });
  });

  describe('checkSciweave14DayInactivity', () => {
    it('should identify FREE tier users who are inactive for 14 days and have used service before', async () => {
      // Setup: FREE plan with limited chats
      await prisma.userFeatureLimit.create({
        data: {
          userId: testUser.id,
          planCodename: PlanCodename.FREE,
          feature: Feature.RESEARCH_ASSISTANT,
          isActive: true,
          useLimit: 10, // Limited chats (not null)
          period: Period.MONTH,
          currentPeriodStart: new Date(),
        },
      });

      // Setup: User used service once 20 days ago
      await prisma.externalApiUsage.create({
        data: {
          userId: testUser.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: 'Old query' },
          createdAt: subDays(new Date(), 20), // 20 days ago
        },
      });

      // Run handler
      const result = await checkSciweave14DayInactivity.handler();

      // Verify user was picked up for email
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should skip users who have never used the service', async () => {
      // Setup: FREE plan with limited chats
      await prisma.userFeatureLimit.create({
        data: {
          userId: testUser.id,
          planCodename: PlanCodename.FREE,
          feature: Feature.RESEARCH_ASSISTANT,
          isActive: true,
          useLimit: 10,
          period: Period.MONTH,
          currentPeriodStart: new Date(),
        },
      });

      // No ExternalApiUsage records = never used

      // Run handler
      const result = await checkSciweave14DayInactivity.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who have used the service recently', async () => {
      // Setup: FREE plan
      await prisma.userFeatureLimit.create({
        data: {
          userId: testUser.id,
          planCodename: PlanCodename.FREE,
          feature: Feature.RESEARCH_ASSISTANT,
          isActive: true,
          useLimit: 10,
          period: Period.MONTH,
          currentPeriodStart: new Date(),
        },
      });

      // Setup: User used service 5 days ago (recent)
      await prisma.externalApiUsage.create({
        data: {
          userId: testUser.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: 'Recent query' },
          createdAt: subDays(new Date(), 5),
        },
      });

      // Run handler
      const result = await checkSciweave14DayInactivity.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who already received the email', async () => {
      // Setup: FREE plan
      await prisma.userFeatureLimit.create({
        data: {
          userId: testUser.id,
          planCodename: PlanCodename.FREE,
          feature: Feature.RESEARCH_ASSISTANT,
          isActive: true,
          useLimit: 10,
          period: Period.MONTH,
          currentPeriodStart: new Date(),
        },
      });

      // Setup: User used service 20 days ago
      await prisma.externalApiUsage.create({
        data: {
          userId: testUser.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: 'Old query' },
          createdAt: subDays(new Date(), 20),
        },
      });

      // Setup: Already sent the email 50 days ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_14_DAY_INACTIVITY,
          createdAt: subDays(new Date(), 50),
        },
      });

      // Run handler
      const result = await checkSciweave14DayInactivity.handler();

      // Verify user was skipped (email sent only once ever)
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who opted out of marketing emails', async () => {
      // Update user to opt out
      await prisma.user.update({
        where: { id: testUser.id },
        data: { receiveSciweaveMarketingEmails: false },
      });

      // Setup: FREE plan
      await prisma.userFeatureLimit.create({
        data: {
          userId: testUser.id,
          planCodename: PlanCodename.FREE,
          feature: Feature.RESEARCH_ASSISTANT,
          isActive: true,
          useLimit: 10,
          period: Period.MONTH,
          currentPeriodStart: new Date(),
        },
      });

      // Setup: User used service 20 days ago
      await prisma.externalApiUsage.create({
        data: {
          userId: testUser.id,
          apiType: ExternalApi.RESEARCH_ASSISTANT,
          data: { query: 'Old query' },
          createdAt: subDays(new Date(), 20),
        },
      });

      // Run handler
      const result = await checkSciweave14DayInactivity.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkOutOfChatsFollowUp', () => {
    it('should identify non-students who received initial email 24-72 hours ago', async () => {
      // Setup: Sent SCIWEAVE_OUT_OF_CHATS_INITIAL 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: subHours(new Date(), 48), // 48 hours ago
        },
      });

      // Note: No student questionnaire = non-student

      // Run handler
      const result = await checkOutOfChatsFollowUp.handler();

      // Verify user was picked up
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should skip users who already received follow-up email', async () => {
      // Setup: Sent initial email 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Setup: Already sent follow-up
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_NO_CTA,
          createdAt: subHours(new Date(), 12),
        },
      });

      // Run handler
      const result = await checkOutOfChatsFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who received initial email too recently (<24 hours)', async () => {
      // Setup: Sent initial email 12 hours ago (too recent)
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: subHours(new Date(), 12),
        },
      });

      // Run handler
      const result = await checkOutOfChatsFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0); // Not picked up at all
    });

    it('should skip users who received initial email too long ago (>72 hours)', async () => {
      // Setup: Sent initial email 80 hours ago (too old)
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: subHours(new Date(), 80),
        },
      });

      // Run handler
      const result = await checkOutOfChatsFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0); // Not picked up at all
    });

    it('should skip users who opted out of marketing emails', async () => {
      // Update user to opt out
      await prisma.user.update({
        where: { id: testUser.id },
        data: { receiveSciweaveMarketingEmails: false },
      });

      // Setup: Sent initial email 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_OUT_OF_CHATS_INITIAL,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Run handler
      const result = await checkOutOfChatsFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkStudentDiscountFollowUp', () => {
    it('should identify students who received limit reached email 24-72 hours ago', async () => {
      // Setup: Mark user as student via questionnaire
      await prisma.interactionLog.create({
        data: {
          userId: testUser.id,
          action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
          extra: JSON.stringify({ role: UserRole.STUDENT }),
        },
      });

      // Setup: Sent SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Run handler
      const result = await checkStudentDiscountFollowUp.handler();

      // Verify user was picked up
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should skip non-students (no questionnaire)', async () => {
      // Setup: No questionnaire = non-student

      // Setup: Sent limit reached email 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Run handler
      const result = await checkStudentDiscountFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who already received student discount email', async () => {
      // Setup: Mark as student
      await prisma.interactionLog.create({
        data: {
          userId: testUser.id,
          action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
          extra: JSON.stringify({ role: UserRole.STUDENT }),
        },
      });

      // Setup: Sent limit reached email 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Setup: Already sent student discount email
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT,
          createdAt: subHours(new Date(), 12),
        },
      });

      // Run handler
      const result = await checkStudentDiscountFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('should skip users who received limit reached email too recently (<24 hours)', async () => {
      // Setup: Mark as student
      await prisma.interactionLog.create({
        data: {
          userId: testUser.id,
          action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
          extra: JSON.stringify({ role: UserRole.STUDENT }),
        },
      });

      // Setup: Sent limit reached email 12 hours ago (too recent)
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: subHours(new Date(), 12),
        },
      });

      // Run handler
      const result = await checkStudentDiscountFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(0); // Not picked up at all
    });

    it('should skip users who opted out of marketing emails', async () => {
      // Update user to opt out
      await prisma.user.update({
        where: { id: testUser.id },
        data: { receiveSciweaveMarketingEmails: false },
      });

      // Setup: Mark as student
      await prisma.interactionLog.create({
        data: {
          userId: testUser.id,
          action: ActionType.SUBMIT_SCIWEAVE_QUESTIONNAIRE,
          extra: JSON.stringify({ role: UserRole.STUDENT }),
        },
      });

      // Setup: Sent limit reached email 48 hours ago
      await prisma.sentEmail.create({
        data: {
          userId: testUser.id,
          emailType: SentEmailType.SCIWEAVE_STUDENT_DISCOUNT_LIMIT_REACHED,
          createdAt: subHours(new Date(), 48),
        },
      });

      // Run handler
      const result = await checkStudentDiscountFollowUp.handler();

      // Verify user was skipped
      expect(result.sent).toBe(0);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
    });
  });
});
