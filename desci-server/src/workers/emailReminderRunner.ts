/**
 * Email Reminder Runner
 *
 * This script runs as a Kubernetes CronJob to check for and send
 * time-based email reminders (overdue reviews, upcoming deadlines, etc.)
 *
 * Usage:
 *   NODE_PATH=./dist node ./dist/workers/emailReminderRunner.js
 *
 * Test locally:
 *   npm run script:email-reminders
 */

import { logger as parentLogger } from '../logger.js';
import { EMAIL_REMINDER_HANDLERS } from './emailReminderConfig.js';
import { prisma } from '../client.js';
import { discordNotify, DiscordChannel, DiscordNotifyType } from '../utils/discordUtils.js';

const logger = parentLogger.child({ module: 'EmailReminderRunner' });

const runEmailReminders = async () => {
  const startTime = Date.now();
  logger.info('🔔 Starting email reminder job');

  const results = {
    total: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    handlers: [] as Array<{
      name: string;
      sent: number;
      skipped: number;
      errors: number;
      duration: number;
    }>,
  };

  for (const handler of EMAIL_REMINDER_HANDLERS) {
    if (!handler.enabled) {
      logger.info({ handler: handler.name }, 'Handler disabled, skipping');
      continue;
    }

    const handlerStartTime = Date.now();
    logger.info({ handler: handler.name, description: handler.description }, 'Running handler');

    try {
      const handlerResult = await handler.handler();
      const duration = Date.now() - handlerStartTime;

      results.sent += handlerResult.sent;
      results.skipped += handlerResult.skipped;
      results.errors += handlerResult.errors;
      results.total += handlerResult.sent + handlerResult.skipped + handlerResult.errors;

      results.handlers.push({
        name: handler.name,
        sent: handlerResult.sent,
        skipped: handlerResult.skipped,
        errors: handlerResult.errors,
        duration,
      });

      logger.info(
        {
          handler: handler.name,
          sent: handlerResult.sent,
          skipped: handlerResult.skipped,
          errors: handlerResult.errors,
          duration: `${duration}ms`,
        },
        'Handler completed',
      );
    } catch (err) {
      logger.error({ err, handler: handler.name }, 'Handler failed with exception');
      results.errors++;
    }
  }

  const totalDuration = Date.now() - startTime;

  logger.info(
    {
      sent: results.sent,
      skipped: results.skipped,
      errors: results.errors,
      total: results.total,
      duration: `${totalDuration}ms`,
      handlers: results.handlers,
    },
    '✅ Email reminder job completed',
  );

  // Send Discord notification with summary
  if (results.sent > 0 || results.errors > 0) {
    const emoji = results.errors > 0 ? '⚠️' : '✅';
    const handlerSummary = results.handlers
      .filter((h) => h.sent > 0 || h.errors > 0)
      .map((h) => `  • ${h.name}: ${h.sent} sent, ${h.errors} errors`)
      .join('\n');
  }

  //     discordNotify({
  //       channel: DiscordChannel.General,
  //       title: `${emoji} Email Reminders Job`,
  //       type: results.errors > 0 ? DiscordNotifyType.ERROR : DiscordNotifyType.SUCCESS,
  //       message: `**Summary:**
  // Total Sent: ${results.sent}
  // Total Errors: ${results.errors}
  // Duration: ${(totalDuration / 1000).toFixed(2)}s

  // **Handlers:**
  // ${handlerSummary || '  • No emails sent'}`,
  //     });
  //   }

  return results;
};

// Main execution
const main = async () => {
  try {
    await runEmailReminders();
    await prisma.$disconnect();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Fatal error in email reminder job');

    // discordNotify({
    //   channel: DiscordChannel.General,
    //   title: '🚨 Email Reminders Job Failed',
    //   type: DiscordNotifyType.ERROR,
    //   message: `Email reminder job crashed with error: ${err.message}`,
    // });

    await prisma.$disconnect();
    process.exit(1);
  }
};

main();
