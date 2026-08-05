/**
 * One-shot backfill: grant REFEREE_FINDER / PRO / 50 to existing lifetime buyers.
 *
 * mapPlanTypeToFeatureConfigs(SCIWEAVE_LIFETIME) used to emit only a
 * RESEARCH_ASSISTANT config, so every lifetime purchase to date granted unlimited
 * chats but left the referee finder on the FREE tier (2/month). The code fix makes
 * future purchases correct; it does nothing for past ones, because
 * updateUserFeatureLimits only runs from the checkout/fulfillment webhooks and
 * those never replay. Hence this script.
 *
 * Idempotent: users who already hold an active REFEREE_FINDER/PRO row are skipped.
 *
 * Run:  yarn script:backfill-lifetime-referee
 *   or: DRY_RUN=1 yarn script:backfill-lifetime-referee   (lists affected users,
 *       writes nothing)
 */
import { Feature, PlanCodename, Period, PlanType, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { FeatureLimitsService } from '../services/FeatureLimits/FeatureLimitsService.js';

const logger = parentLogger.child({ module: 'backfill-lifetime-referee-entitlement' });
const DRY_RUN = process.env.DRY_RUN === '1';

const main = async () => {
  const lifetimeSubs = await prisma.subscription.findMany({
    where: { planType: PlanType.SCIWEAVE_LIFETIME, status: SubscriptionStatus.ACTIVE },
    select: { userId: true },
    distinct: ['userId'],
  });

  logger.info({ count: lifetimeSubs.length, dryRun: DRY_RUN }, 'Found active lifetime subscribers');

  let granted = 0;
  let skipped = 0;
  let failed = 0;

  for (const { userId } of lifetimeSubs) {
    const existing = await prisma.userFeatureLimit.findFirst({
      where: {
        userId,
        feature: Feature.REFEREE_FINDER,
        isActive: true,
        planCodename: PlanCodename.PRO,
      },
      select: { id: true },
    });

    if (existing) {
      skipped++;
      logger.debug({ userId }, 'Already has REFEREE_FINDER/PRO, skipping');
      continue;
    }

    if (DRY_RUN) {
      granted++;
      logger.info({ userId }, 'DRY RUN: would grant REFEREE_FINDER/PRO/50');
      continue;
    }

    // currentPeriodStart is passed EXPLICITLY. updateFeatureLimits otherwise
    // inherits it from the row being replaced, which would start this grant inside
    // the old FREE row's already-consumed window.
    const result = await FeatureLimitsService.updateFeatureLimits({
      userId,
      feature: Feature.REFEREE_FINDER,
      planCodename: PlanCodename.PRO,
      period: Period.MONTH,
      useLimit: 50,
      currentPeriodStart: new Date(),
    });

    if (result.isErr()) {
      failed++;
      logger.error({ userId, error: result.error }, 'Failed to grant REFEREE_FINDER/PRO');
    } else {
      granted++;
      logger.info({ userId }, 'Granted REFEREE_FINDER/PRO/50');
    }
  }

  logger.info({ granted, skipped, failed, dryRun: DRY_RUN }, 'Backfill complete');

  if (failed > 0) process.exitCode = 1;
};

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    logger.error({ error }, 'Backfill failed');
    process.exit(1);
  });
