/**
 * Email Reminder Dry Run Utilities
 *
 * Track and display which emails would be sent without actually sending them.
 *
 * Usage:
 *   EMAIL_REMINDER_DRY_RUN=true npm run script:email-reminders
 */

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'EmailDryRun' });

export interface DryRunEmailRecord {
  userId: number;
  email: string;
  emailType: string;
  handlerName: string;
  details?: Record<string, any>;
}

const recordedEmails: DryRunEmailRecord[] = [];

/**
 * Check if dry run mode is enabled
 */
export const isDryRunMode = (): boolean => {
  return process.env.EMAIL_REMINDER_DRY_RUN === 'true' || process.env.EMAIL_REMINDER_DRY_RUN === '1';
};

/**
 * Record an email that would be sent
 */
export const recordDryRunEmail = (email: DryRunEmailRecord): void => {
  if (!isDryRunMode()) return;
  recordedEmails.push(email);
  logger.debug({ email }, 'Recorded dry run email');
};

/**
 * Get all recorded emails
 */
export const getDryRunEmails = (): DryRunEmailRecord[] => {
  return recordedEmails;
};

/**
 * Clear all recorded emails
 */
export const clearDryRunEmails = (): void => {
  recordedEmails.length = 0;
};

/**
 * Display recorded emails in a formatted table
 */
export const displayDryRunTable = (): void => {
  if (!isDryRunMode() || recordedEmails.length === 0) {
    logger.info('🔍 DRY RUN: No emails would be sent');
    return;
  }

  logger.info('\n' + '='.repeat(120));
  logger.info('🔍 DRY RUN MODE - Emails that would be sent:');
  logger.info('='.repeat(120));

  // Calculate column widths
  const colWidths = {
    userId: Math.max(6, ...recordedEmails.map((e) => e.userId.toString().length)),
    email: Math.max(25, ...recordedEmails.map((e) => e.email.length)),
    emailType: Math.max(20, ...recordedEmails.map((e) => e.emailType.length)),
    handler: Math.max(20, ...recordedEmails.map((e) => e.handlerName.length)),
  };

  // Header
  const header =
    `| ${'UserID'.padEnd(colWidths.userId)} ` +
    `| ${'Email'.padEnd(colWidths.email)} ` +
    `| ${'Email Type'.padEnd(colWidths.emailType)} ` +
    `| ${'Handler'.padEnd(colWidths.handler)} |`;

  const separator = '+' + '-'.repeat(header.length - 2) + '+';

  logger.info(separator);
  logger.info(header);
  logger.info(separator);

  // Rows
  recordedEmails.forEach((email) => {
    const row =
      `| ${email.userId.toString().padEnd(colWidths.userId)} ` +
      `| ${email.email.padEnd(colWidths.email)} ` +
      `| ${email.emailType.padEnd(colWidths.emailType)} ` +
      `| ${email.handlerName.padEnd(colWidths.handler)} |`;
    logger.info(row);
  });

  logger.info(separator);
  logger.info(`Total: ${recordedEmails.length} emails would be sent`);
  logger.info('='.repeat(120) + '\n');

  // Group by handler
  const byHandler = recordedEmails.reduce(
    (acc, email) => {
      acc[email.handlerName] = (acc[email.handlerName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  logger.info('📊 Summary by handler:');
  Object.entries(byHandler).forEach(([handler, count]) => {
    logger.info(`  • ${handler}: ${count} emails`);
  });

  // Group by email type
  const byType = recordedEmails.reduce(
    (acc, email) => {
      acc[email.emailType] = (acc[email.emailType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  logger.info('\n📧 Summary by email type:');
  Object.entries(byType).forEach(([type, count]) => {
    logger.info(`  • ${type}: ${count} emails`);
  });

  logger.info('');
};

/**
 * Get summary statistics
 */
export const getDryRunSummary = () => {
  return {
    total: recordedEmails.length,
    byHandler: recordedEmails.reduce(
      (acc, email) => {
        acc[email.handlerName] = (acc[email.handlerName] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    byEmailType: recordedEmails.reduce(
      (acc, email) => {
        acc[email.emailType] = (acc[email.emailType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
  };
};
