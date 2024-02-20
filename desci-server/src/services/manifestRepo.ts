import { Doc, getHeads } from '@automerge/automerge';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import {
  ResearchObjectComponentTypeMap,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import { Node } from '@prisma/client';

import { logger } from '../logger.js';
import { backendRepo } from '../repo.js';
import { ResearchObjectDocument } from '../types/documents.js';

import { getManifestFromNode } from './data/processing.js';
import repoService from './repoService.js';

export type NodeUuid = string & { _kind: 'uuid' };

export const getAutomergeUrl = (documentId: DocumentId): AutomergeUrl => {
  return `automerge:${documentId}` as AutomergeUrl;
};

export const getLatestManifestFromNode = async (node: Node) => {
  logger.info({ uuid: node.uuid }, 'START [getLatestManifestFromNode]');
  let manifest = await repoService.getDraftManifest(node.uuid as NodeUuid);
  if (!manifest) {
    const publishedManifest = await getManifestFromNode(node);
    manifest = publishedManifest.manifest;
  }
  return manifest;
};

export function assertNever(value: never) {
  console.error('Unknown value', value);
  throw Error('Not Possible');
}

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

const updateManifestComponent = (
  doc: Doc<ResearchObjectDocument>,
  component: ResearchObjectV1Component,
  componentIndex: number,
) => {
  if (componentIndex === -1 || componentIndex === undefined) return;

  const currentComponent = doc.manifest.components[componentIndex];
  currentComponent.type = component?.type || currentComponent.type;

  if (!currentComponent.starred) currentComponent.starred = false;
  currentComponent.starred = component?.starred || currentComponent.starred;
};

const updateComponentTypeMap = (
  doc: Doc<ResearchObjectDocument>,
  path: string,
  compTypeMap: ResearchObjectComponentTypeMap,
) => {
  const currentComponent = doc.manifest.components.find((c) => c.payload?.path === path);
  if (!currentComponent) return;

  const existingType = currentComponent.type;
  if (!isResearchObjectComponentTypeMap(existingType)) {
    currentComponent.type = {};
  }

  const componentType = currentComponent.type;
  const update = {
    ...(isResearchObjectComponentTypeMap(existingType) && { ...existingType }),
    ...compTypeMap,
  };

  Object.entries(update).forEach(([key, value]) => {
    if (!componentType[key]) componentType[key] = '';
    componentType[key] = value;
  });
};
