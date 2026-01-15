/**
 * Daily Credit Refresh Script
 * Run this script via cron to refresh daily credits for trial users
 * Example cron: 0 * * * * (every hour)
 */

import { runDailyCreditRefreshJob } from '../services/dailyCreditRefresh.js';
import { logger } from '../logger.js';

async function main() {
  logger.info('Starting daily credit refresh script');
  
  try {
    await runDailyCreditRefreshJob();
    logger.info('Daily credit refresh script completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Daily credit refresh script failed');
    process.exit(1);
  }
}

main();
