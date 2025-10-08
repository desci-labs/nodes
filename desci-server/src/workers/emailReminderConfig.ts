/**
 * Configuration for automated email reminders
 *
 * This file defines the different types of time-based emails that should be sent
 * based on various conditions (deadlines, overdue items, pending actions, etc.)
 */

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { EmailTypes, sendEmail } from '../services/email/email.js';

const logger = parentLogger.child({ module: 'EmailReminderConfig' });

export type EmailReminderHandler = {
  name: string;
  description: string;
  enabled: boolean;
  handler: () => Promise<{ sent: number; skipped: number; errors: number }>;
};

/**
 * Example handler template - copy this to create new reminder types
 */
// const exampleHandler: EmailReminderHandler = {
//   name: 'Example Handler',
//   description: 'Description of what this handler does',
//   enabled: false,
//   handler: async () => {
//     let sent = 0;
//     let skipped = 0;
//     let errors = 0;
//
//     try {
//       // Query database for conditions
//       // Send emails as needed
//       // Update counters
//     } catch (err) {
//       logger.error({ err }, 'Handler failed');
//       errors++;
//     }
//
//     return { sent, skipped, errors };
//   },
// };

/**
 * All configured email reminder handlers
 * Add your handlers to this array
 */
export const EMAIL_REMINDER_HANDLERS: EmailReminderHandler[] = [
  // Add handlers here
];
