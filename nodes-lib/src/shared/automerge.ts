import type {
  ResearchObjectV1,
} from "@desci-labs/desci-models";

export type ResearchObjectDocument = {
  manifest: ResearchObjectV1;
  uuid: string;
  driveClock: string;
};
