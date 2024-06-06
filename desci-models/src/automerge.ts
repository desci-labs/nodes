/**
 * This file contains automerge actions for modifying the manifest file.
 * This can be used by applications who wish to build a responsive,
 * multi-client application for editing the manifest.
 *
 * @package
 */

import {
  ResearchObjectComponentTypeMap,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
} from './ResearchObject';

export type ManifestActions =
  | { type: 'Add Components'; components: ResearchObjectV1Component[] }
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
  | { type: 'Upsert Component'; component: ResearchObjectV1Component }
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
    }
  | { type: 'Remove Dpid' }
  | {
      type: 'Update CoverImage';
      cid: string | undefined;
    };
