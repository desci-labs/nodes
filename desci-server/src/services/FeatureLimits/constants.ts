import { PlanCodename, Feature, Period } from '@prisma/client';

export interface FeatureLimitConfig {
  planCodename: PlanCodename;
  feature: Feature;
  period: Period;
  useLimit: number | null; // null = unlimited
}

// Reference defaults for common plan configurations
export const REFEREE_FINDER_LIMIT_DEFAULTS: Partial<Record<PlanCodename, FeatureLimitConfig>> = {
  [PlanCodename.FREE]: {
    planCodename: PlanCodename.FREE,
    feature: Feature.REFEREE_FINDER,
    period: Period.MONTH,
    useLimit: 2,
  },
  [PlanCodename.STARTER]: {
    planCodename: PlanCodename.STARTER,
    feature: Feature.REFEREE_FINDER,
    period: Period.MONTH,
    useLimit: 10,
  },
  [PlanCodename.PRO]: {
    planCodename: PlanCodename.PRO,
    feature: Feature.REFEREE_FINDER,
    period: Period.MONTH,
    useLimit: 50,
  },
};
