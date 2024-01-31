import { Doc, getHeads } from '@automerge/automerge';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import {
  CommonComponentPayload,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  ResearchObjectV1AuthorRole,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
  ResearchObjectV1Organization,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';

import { logger } from '../logger.js';
import { backendRepo } from '../repo.js';
import { ResearchObjectDocument } from '../types.js';
import { z } from 'zod';

export type NodeUuid = string & { _kind: 'uuid' };

export const getAutomergeUrl = (documentId: DocumentId): AutomergeUrl => {
  return `automerge:${documentId}` as AutomergeUrl;
};

export function assertNever(value: never) {
  console.error('Unknown value', value);
  throw Error('Not Possible');
}

export type ManifestActions =
  | { type: 'Add Components'; components: ResearchObjectV1Component[] }
  | { type: 'Delete Component'; componentId: string }
  | { type: 'Delete Components'; pathsToDelete: string[] }
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
  | { type: 'Set Drive Clock'; time: string };
// frontend changes to support

export const getDocumentUpdater = (documentId: DocumentId) => {
  const automergeUrl = getAutomergeUrl(documentId);
  const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

  return async (action: ManifestActions) => {
    if (!handle) return;
    let latestDocument = await handle.doc();

    if (!latestDocument) {
      logger.error({ node: documentId }, 'Automerge document not found');
      // throw new Error('Automerge Document Not found');
      return;
    }

    const heads = getHeads(latestDocument);
    logger.info({ heads }, `Document`);
    logger.info({ action }, `DocumentUpdater::Dispatched`);

    switch (action.type) {
      case 'Add Components':
        const uniqueComponents = action.components.filter((componentToAdd) =>
          latestDocument?.manifest.components.some((c) => c.payload?.path === componentToAdd.payload?.path),
        );
        if (uniqueComponents.length > 0) {
          handle.change(
            (document) => {
              uniqueComponents.forEach((component) => {
                document.manifest.components.push(component);
              });
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'Rename Component':
        handle.change(
          (document) => {
            const component = document.manifest.components.find((c) => c.payload?.path === action.path);
            if (component) component.name = action.fileName;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Delete Component':
        const deleteIdx = latestDocument.manifest.components.findIndex((c) => c.id === action.componentId);
        if (deleteIdx !== -1) {
          logger.info({ action, deleteIdx }, `DocumentUpdater::Deleteing`);
          handle.change(
            (document) => {
              document.manifest.components.splice(deleteIdx, 1);
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'Delete Components':
        const componentEntries = latestDocument.manifest.components
          .map((c) => (action.pathsToDelete.includes(c.payload?.path) ? c.payload?.path : null))
          .filter(Boolean) as string[];
        if (componentEntries.length > 0) {
          logger.info({ action, componentEntries }, `DocumentUpdater::Delete Components`);
          handle.change(
            (document) => {
              for (const path of componentEntries) {
                const deleteIdx = document.manifest.components.findIndex((c) => c.payload?.path === path);
                logger.info({ path, deleteIdx }, `DocumentUpdater::Delete`);
                if (deleteIdx !== -1) document.manifest.components.splice(deleteIdx, 1);
              }
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'Rename Component Path':
        const components = latestDocument.manifest.components.filter(
          (component) =>
            component.payload?.path?.startsWith(action.oldPath + '/') || component.payload?.path === action.oldPath,
        );
        if (components.length > 0) {
          handle.change(
            (document) => {
              const components = document.manifest.components.filter(
                (component) =>
                  component.payload?.path.startsWith(action.oldPath + '/') ||
                  component.payload?.path === action.oldPath,
              );
              for (const component of components) {
                component.payload.path = component.payload?.path.replace(action.oldPath, action.newPath);
              }
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'Update Component':
        handle.change(
          (document) => {
            updateManifestComponent(document, action.component, action.componentIndex);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Assign Component Type':
        handle.change(
          (document) => {
            updateComponentTypeMap(document, action.component.payload?.path, action.componentTypeMap);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Set Drive Clock':
        handle.change(
          (document) => {
            if (document.driveClock && document.driveClock === action.time) return; // Don't update if already the latest
            document.driveClock = action.time;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      default:
        assertNever(action);
    }
    latestDocument = await handle.doc();

    if (latestDocument) {
      const updatedHeads = getHeads(latestDocument);
      logger.info({ action, heads: updatedHeads }, `DocumentUpdater::Exit`);
    }
    return latestDocument;
  };
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

const componentType = z.nativeEnum(ResearchObjectComponentType);
const componentTypeMap = z.record(componentType);

const researchObject = z
  .object({
    id: z.string(),
    version: z.union([z.literal('desci-nodes-0.1.0'), z.literal('desci-nodes-0.2.0'), z.literal(1)]),
    name: z.string(),
    payload: z.object({ path: z.string() }).passthrough(),
    components: z.array(z.object({ id: z.string() }).passthrough()),
  })
  .passthrough();

/**
   * export interface CommonComponentPayload {
    title?: string;
    keywords?: string[];
    description?: string;
    licenseType?: string;
    path?: string;
}
   */
const commonPayloadSchema = z.object({
  title: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  description: z.string().optional(),
  licenseType: z.string().optional(),
  path: z.string().optional(),
});

const componentSchema: z.ZodType<ResearchObjectV1Component> = z
  .object({
    id: z.string(),
    name: z.string(),
    payload: commonPayloadSchema.passthrough(),
    type: z.union([componentType, componentTypeMap]),
    starred: z.boolean(),
  })
  .refine((arg) => {
    if (!arg.starred) return false;
    return true;
  });
// .passthrough();

export interface ResearchObjectV1Author {
  name: string;
  orcid?: string | undefined;
  googleScholar?: string | undefined;
  role: ResearchObjectV1AuthorRole;
  organizations?: ResearchObjectV1Organization[] | undefined;
  github?: string | undefined;
}

const contributor: z.ZodType<ResearchObjectV1Author> = z.object({
  name: z.string(),
  orcid: z.string().optional(),
  googleScholar: z.string().optional(),
  role: z.nativeEnum(ResearchObjectV1AuthorRole),
  organizations: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  github: z.string().optional(),
});
// .passthrough();

const dpid: z.ZodType<ResearchObjectV1Dpid> = z.object({ prefix: z.string(), id: z.string() }).required();

export const actionsSchema = z.array(
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('Publish dPID'), dpid: dpid }),
    z.object({ type: z.literal('Update Title'), title: z.string() }),
    z.object({ type: z.literal('Update Description'), description: z.string() }),
    z.object({ type: z.literal('Update License'), defaultLicense: z.string() }),
    z.object({ type: z.literal('Update ResearchFields'), researchFields: z.array(z.string()) }),
    z.object({ type: z.literal('Add Component'), component: componentSchema }),
    z.object({ type: z.literal('Delete Component'), path: z.string() }),
    z.object({ type: z.literal('Add Contributor'), author: contributor }),
    z.object({ type: z.literal('Remove Contributor'), contributorIndex: z.number() }),
    z.object({ type: z.literal('Pin Component'), componentIndex: z.number() }),
    z.object({ type: z.literal('UnPin Component'), componentIndex: z.number() }),
  ]),
);
