import { PlanType, StripeInvoiceStatus, SubscriptionStatus } from '@prisma/client';
import { Response } from 'express';

import { SuccessResponse } from '../../../core/ApiResponse.js';
import { logger as parentLogger } from '../../../logger.js';
import { RequestWithUser } from '../../../middleware/index.js';
import { prisma } from '../../../client.js';

const logger = parentLogger.child({ module: 'AdminSciweaveSubscriptionMetrics' });

/**
 * GET /v1/admin/metrics/sciweave-subscriptions
 *
 * Aggregate Stripe subscription metrics for the sciweave admin dashboard.
 * No query params today — the dashboard always wants "now" + a fixed
 * trailing-30d window for new/canceled and revenue.
 *
 * Returns:
 *   - byStatus: count of Subscriptions per SubscriptionStatus
 *   - byPlan: count of ACTIVE/TRIALING subs per PlanType
 *   - new30d: count where createdAt >= now-30d
 *   - canceled30d: count where canceledAt >= now-30d
 *   - revenue30dCents: sum of paid Invoice rows in the last 30d
 *   - mrrCents: sum of paid Invoice rows in last 30d that are linked to an
 *     active subscription. This is "cash MRR" rather than booked MRR — it
 *     undercounts annual subs in their non-renewal months but stays honest
 *     without needing per-plan price lookup tables.
 */
export const getSciweaveSubscriptionMetrics = async (_req: RequestWithUser, res: Response) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [byStatusRaw, byPlanRaw, new30d, canceled30d, revenueAgg, mrrAgg] = await Promise.all([
      prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.subscription.groupBy({
        by: ['planType', 'billingInterval'],
        where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] } },
        _count: { _all: true },
      }),
      prisma.subscription.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.subscription.count({
        where: { canceledAt: { gte: thirtyDaysAgo } },
      }),
      prisma.invoice.aggregate({
        where: {
          status: StripeInvoiceStatus.PAID,
          paidAt: { gte: thirtyDaysAgo },
        },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: {
          status: StripeInvoiceStatus.PAID,
          paidAt: { gte: thirtyDaysAgo },
          subscription: {
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] },
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const byStatus = Object.fromEntries(
      Object.values(SubscriptionStatus).map((s) => [s, 0]),
    ) as Record<SubscriptionStatus, number>;
    for (const row of byStatusRaw) byStatus[row.status] = row._count._all;

    const byPlan: Array<{ planType: PlanType; billingInterval: string; count: number }> = byPlanRaw.map((row) => ({
      planType: row.planType,
      billingInterval: row.billingInterval,
      count: row._count._all,
    }));

    return new SuccessResponse({
      asOf: now.toISOString(),
      byStatus,
      byPlan,
      new30d,
      canceled30d,
      revenue30dCents: revenueAgg._sum.amount ?? 0,
      mrrCents: mrrAgg._sum.amount ?? 0,
    }).send(res);
  } catch (err) {
    logger.error({ err }, 'getSciweaveSubscriptionMetrics failed');
    throw err;
  }
};
