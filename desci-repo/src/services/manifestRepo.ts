import { Doc, getHeads } from '@automerge/automerge';
import { AutomergeUrl, DocumentId } from '@automerge/automerge-repo';
import {
  CodeComponent,
  DataComponent,
  ExternalLinkComponent,
  PdfComponent,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
  isResearchObjectComponentTypeMap,
} from '@desci-labs/desci-models';
import isEqual from 'deep-equal';

import { logger as parentLogger } from '../logger.js';
import { backendRepo } from '../repo.js';
import { ResearchObjectDocument } from '../types.js';

const logger = parentLogger.child({ module: 'manifestRepo.ts' });

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
    }
  | {
      type: "Remove Dpid";
      dpid: ResearchObjectV1Dpid;
    };

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
    logger.info({ heads }, `Document Heads`);
    logger.info({ action }, `DocumentUpdater::Dispatched`);

    switch (action.type) {
      case 'Add Components':
        const uniqueComponents = action.components.filter(
          (componentToAdd) =>
            !latestDocument?.manifest.components.some((c) => c.payload?.path === componentToAdd.payload?.path),
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
        const deleteIdx = latestDocument.manifest.components.findIndex((c) => c.payload?.path === action.path);
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
          .map((c) => (action.paths.includes(c.payload?.path) ? c.payload?.path : null))
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
      case 'Update License':
        handle.change(
          (document) => {
            document.manifest.defaultLicense = action.defaultLicense;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Update Description':
        handle.change(
          (document) => {
            if (!document.manifest.description) document.manifest.description = '';
            document.manifest.description = action.description;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Update Title':
        handle.change(
          (document) => {
            document.manifest.title = action.title;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Update ResearchFields':
        handle.change(
          (document) => {
            document.manifest.researchFields = action.researchFields;
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Add Component':
        handle.change(
          (document) => {
            addManifestComponent(document, action.component);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Delete Component':
        handle.change(
          (document) => {
            deleteComponent(document, action.path);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Update Component':
        handle.change(
          (document) => {
            updateManifestComponent(document, action.component, action.componentIndex);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Publish Dpid':
        handle.change(
          (document) => {
            addDpid(document, action.dpid);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case "Remove Dpid":
        handle.change(
          (document) => {
            removeDpid(document);
          },
          { time: Date.now(), message: action.type }
        );
        break;
      case 'Pin Component':
        let componentIndex = latestDocument?.manifest.components.findIndex((c) => c.payload?.path === action.path);
        if (componentIndex && componentIndex != -1) {
          handle.change(
            (document) => {
              togglePin(document, componentIndex, true);
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'UnPin Component':
        let index = latestDocument?.manifest.components.findIndex((c) => c.payload?.path === action.path);
        if (index && index != -1) {
          handle.change(
            (document) => {
              togglePin(document, index, false);
            },
            { time: Date.now(), message: action.type },
          );
        }
        break;
      case 'Remove Contributor':
        handle.change(
          (document) => {
            document.manifest.authors?.splice(action.contributorIndex, 1);
          },
          { time: Date.now(), message: action.type },
        );
        break;
      case 'Add Contributor':
        handle.change(
          (document) => {
            if (!document.manifest.authors) document.manifest.authors = [];
            document.manifest.authors?.push(action.author);
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

const updateComponentTypeMap = (
  doc: Doc<ResearchObjectDocument>,
  path: string,
  compTypeMap: ResearchObjectComponentTypeMap,
): void => {
  const currentComponent = doc.manifest.components.find(
    (c) => c.payload?.path === path
  );
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

const addManifestComponent = (
  doc: Doc<ResearchObjectDocument>,
  component: ResearchObjectV1Component
): void => {
  doc.manifest.components.push(component);
};

const deleteComponent = (
  doc: Doc<ResearchObjectDocument>,
  path: string
): void => {
  const deleteIdx = doc.manifest.components.findIndex(
    (component) => component?.payload?.path === path
  );
  if (deleteIdx !== -1) doc.manifest.components.splice(deleteIdx, 1);
};

const togglePin = (
  doc: Doc<ResearchObjectDocument>,
  componentIndex: number, pin: boolean
): void => {
  const currentComponent = doc.manifest.components[componentIndex];
  currentComponent.starred = pin;
};

const addDpid = (
  doc: Doc<ResearchObjectDocument>,
  dpid: ResearchObjectV1Dpid
): void => {
  if (doc.manifest.dpid) return;
  doc.manifest.dpid = dpid;
};

/** In an unavilable optimistic dPID was written to the manifest, it must
 * be removed again.
*/
const removeDpid = (
  doc: Doc<ResearchObjectDocument>
): void => {
  delete doc.manifest.dpid;
};

const updateManifestComponent = (
  doc: Doc<ResearchObjectDocument>,
  component: ResearchObjectV1Component,
  componentIndex: number,
): void => {
  if (componentIndex === -1 || componentIndex === undefined) return;

  const currentComponent = doc.manifest.components[componentIndex];
  currentComponent.type = component?.type || currentComponent.type;

  if (!currentComponent.starred) currentComponent.starred = false;
  currentComponent.starred = component?.starred || currentComponent.starred;

  if (component.name) {
    currentComponent.name = component.name;
  }

  if ('subtype' in component) {
    if (component.subtype) {
      if (isPdfComponent(component, currentComponent)) {
        (currentComponent as PdfComponent).subtype = component.subtype;
        /* Only pdf and external links component have subtypes in the model */
        // } else if (isDataComponent(component, currentComponent)) {
        //   (currentComponent as DataComponent).subtype = component.subtype;
        // } else if (isCodeComponent(component, currentComponent)) {
        //   (currentComponent as CodeComponent).subtype = component.subtype;
      } else if (isExternalLinkComponent(component, currentComponent)) {
        (currentComponent as ExternalLinkComponent).subtype = component.subtype;
      }
    } else {
      if (isPdfComponent(component, currentComponent)) {
        delete (currentComponent as PdfComponent).subtype;
        /* Only pdf and external links component have subtypes in the model */
        // } else if (isDataComponent(component, currentComponent)) {
        //   delete (currentComponent as DataComponent).subtype;
        // } else if (isCodeComponent(component, currentComponent)) {
        //   delete (currentComponent as CodeComponent).subtype;
      } else if (isExternalLinkComponent(component, currentComponent)) {
        delete (currentComponent as ExternalLinkComponent).subtype;
      } else {
        delete currentComponent?.['subtype'];
      }
    }
  }

  const currentPayload = currentComponent.payload;
  if ('payload' in component) {
    // Prevent previous payload overwrite
    Object.entries(component.payload).forEach(([key, value]) => {
      if (component.payload[key] === null || component.payload[key] === undefined) return;
      if (isEqual(currentPayload[key], value)) return;
      if (!currentPayload[key]) currentPayload[key] = getTypeDefault(value);
      currentPayload[key] = value;
    });
  }
};

type TypeInitialisers = {} | '' | 0 | [];

const getTypeDefault = (value: unknown): TypeInitialisers => {
  if (Array.isArray(value)) return [];
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'object') return {};
  return '';
};

const isPdfComponent = (
  component: ResearchObjectV1Component,
  currentComponent: ResearchObjectV1Component,
): component is PdfComponent => {
  return (
    component.type === ResearchObjectComponentType.PDF || currentComponent.type === ResearchObjectComponentType.PDF
  );
};

const isDataComponent = (
  component: ResearchObjectV1Component,
  currentComponent: ResearchObjectV1Component,
): component is DataComponent => {
  return (
    component.type === ResearchObjectComponentType.DATA || currentComponent.type === ResearchObjectComponentType.DATA
  );
};

const isCodeComponent = (
  component: ResearchObjectV1Component,
  currentComponent: ResearchObjectV1Component,
): component is CodeComponent => {
  return (
    component.type === ResearchObjectComponentType.CODE || currentComponent.type === ResearchObjectComponentType.CODE
  );
};

const isExternalLinkComponent = (
  component: ResearchObjectV1Component,
  currentComponent: ResearchObjectV1Component,
): component is ExternalLinkComponent => {
  return (
    component.type === ResearchObjectComponentType.LINK || currentComponent.type === ResearchObjectComponentType.LINK
  );
};
