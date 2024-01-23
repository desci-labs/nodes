import { Doc, getHeads } from '@automerge/automerge';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import {
  ResearchObjectComponentTypeMap,
  ResearchObjectV1,
  ResearchObjectV1Component,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import { Node } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';
import { backendRepo } from '../repo.js';
import { ResearchObjectDocument } from '../types.js';

import { getManifestFromNode } from '../controllers/nodes/utils.js';

export type NodeUuid = string & { _kind: 'uuid' };

export const getAutomergeUrl = (documentId: DocumentId): AutomergeUrl => {
  return `automerge:${documentId}` as AutomergeUrl;
};

export const createManifestDocument = async function ({ node, manifest }: { node: Node; manifest: ResearchObjectV1 }) {
  logger.info({ uuid: node.uuid }, 'START [CreateNodeDocument]');
  const uuid = node.uuid.replace(/\.$/, '');
  logger.info('[Backend REPO]:', backendRepo.networkSubsystem.peerId);

  const handle = backendRepo.create<ResearchObjectDocument>();
  handle.change(
    (document) => {
      document.manifest = manifest;
      document.uuid = uuid;
      document.driveClock = Date.now().toString();
    },
    { message: 'Init Document', time: Date.now() },
  );

  const document = await handle.doc();
  logger.info('[AUTOMERGE]::[HANDLE NEW CHANGED]', handle.url, handle.isReady(), document);

  await prisma.node.update({ where: { id: node.id }, data: { manifestDocumentId: handle.documentId } });

  logger.info('END [CreateNodeDocument]', { documentId: handle.documentId });
  return handle.documentId;
};

export const getDraftManifestFromUuid = async function (uuid: NodeUuid) {
  logger.info({ uuid }, 'START [getDraftManifestFromUuid]');
  // const backendRepo = server.repo;
  const node = await prisma.node.findFirst({
    where: { uuid },
  });

  if (!node) {
    throw new Error(`Node with uuid ${uuid} not found!`);
  }

  const automergeUrl = getAutomergeUrl(node.manifestDocumentId as DocumentId);
  const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

  const document = await handle.doc();

  logger.info({ uuid: document.uuid, documentId: handle.documentId }, '[AUTOMERGE]::[Document Found]');

  logger.info({ uuid }, '[END]::GetDraftManifestFromUuid');
  return document.manifest;
};

export const getDraftManifest = async function (node: Node) {
  return getDraftManifestFromUuid(node.uuid as NodeUuid);
};

export const getLatestManifestFromNode = async (node: Node) => {
  logger.info({ uuid: node.uuid }, 'START [getLatestManifestFromNode]');
  let manifest = await getDraftManifestFromUuid(node.uuid as NodeUuid);
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

export const getNodeManifestUpdater = (node: Node) => {
  const automergeUrl = getAutomergeUrl(node.manifestDocumentId as DocumentId);
  const handle = backendRepo.find<ResearchObjectDocument>(automergeUrl as AutomergeUrl);

  return async (action: ManifestActions) => {
    if (!handle) return null;
    let latestDocument = await handle.doc();

    if (!latestDocument) {
      logger.error({ node: node.manifestDocumentId, nodeUUid: node.uuid }, 'Automerge document not found');
      throw new Error('Automerge Document Not found');
    }

    const heads = getHeads(latestDocument);
    logger.info({ heads }, `Document`);
    logger.info({ action }, `DocumentUpdater::Dispatched`);

    switch (action.type) {
      case 'Add Components':
        const uniqueComponents = action.components.filter(
          (componentToAdd) =>
            !latestDocument.manifest.components.some((c) => c.payload?.path === componentToAdd.payload?.path),
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
    const updatedHeads = getHeads(latestDocument);
    logger.info({ action, heads: updatedHeads }, `DocumentUpdater::Exit`);
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