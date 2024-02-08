import type {
  ResearchObjectComponentTypeMap,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid
} from "@desci-labs/desci-models";

export type ManifestActions =
  | { type: 'Delete Components'; paths: string[] }
  | { type: 'Rename Component'; path: string; fileName: string }
  | { type: 'Rename Component Path'; oldPath: string; newPath: string }
  | {
      type: 'Update Component';
      component: ResearchObjectV1Component;
      componentIndex: number;
    }
  | {
      type: 'Assign Component Type';
      component: ResearchObjectV1Component;
      componentTypeMap: ResearchObjectComponentTypeMap;
    }
  | { type: 'Set Drive Clock'; time: string }
  // frontend changes to support
  | { type: 'Update Title'; title: string }
  | { type: 'Update Description'; description: string }
  | { type: 'Update License'; defaultLicense: string }
  | { type: 'Update ResearchFields'; researchFields: string[] }
  | { type: 'Add Component'; component: ResearchObjectV1Component }
  | { type: 'Delete Component'; path: string }
  | { type: 'Add Contributor'; author: ResearchObjectV1Author }
  | { type: 'Remove Contributor'; contributorIndex: number }
  | { type: 'Pin Component'; path: string }
  | { type: 'UnPin Component'; path: string }
  | {
      type: 'Update Component';
      component: ResearchObjectV1Component;
      componentIndex: number;
    }
  | {
      type: 'Publish Dpid';
      dpid: ResearchObjectV1Dpid;
    };

export interface ResearchObjectDocument {
  manifest: ResearchObjectV1;
  uuid: string;
  driveClock?: string;
};
