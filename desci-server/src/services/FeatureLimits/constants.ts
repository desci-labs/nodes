import { PlanCodename, Feature, Period } from '@prisma/client';

import { SCIWEAVE_FREE_LIMIT } from '../../config.js';

export interface FeatureLimitConfig {
  planCodename: PlanCodename;
  feature: Feature;
  period: Period;
  useLimit: number | null; // null = unlimited
}

// Reference defaults for common plan configurations, per feature
export const FEATURE_LIMIT_DEFAULTS: Record<Feature, Partial<Record<PlanCodename, FeatureLimitConfig>>> = {
  [Feature.REFEREE_FINDER]: {
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
  },
  [Feature.RESEARCH_ASSISTANT]: {
    [PlanCodename.FREE]: {
      planCodename: PlanCodename.FREE,
      feature: Feature.RESEARCH_ASSISTANT,
      period: Period.MONTH,
      useLimit: SCIWEAVE_FREE_LIMIT,
    },
    [PlanCodename.PREMIUM]: {
      planCodename: PlanCodename.PREMIUM,
      feature: Feature.RESEARCH_ASSISTANT,
      period: Period.MONTH,
      useLimit: null,
    },
  },
};
