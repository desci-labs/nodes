import { Doc, getHeads } from '@automerge/automerge';
import { AutomergeUrl, DocHandle, DocumentId, Repo } from '@automerge/automerge-repo';
import {
  CodeComponent,
  DataComponent,
  ExternalLinkComponent,
  PdfComponent,
  ResearchObjectComponentType,
  ResearchObjectComponentTypeMap,
  ResearchObjectV1Component,
  ResearchObjectV1Dpid,
  isResearchObjectComponentTypeMap,
  ManifestActions,
  ResearchObjectV1,
} from '@desci-labs/desci-models';
import isEqual from 'deep-equal';

// import { logger as parentLogger } from '../logger.js';
// import { backendRepo, repoManager } from '../repo.js';

// const logger = parentLogger.child({ module: 'manifestRepo.ts' });

export type NodeUuid = string & { _kind: 'uuid' };

export interface ResearchObjectDocument {
  manifest: ResearchObjectV1;
  uuid: string;
  driveClock: string;
}

export const getAutomergeUrl = (documentId: DocumentId): AutomergeUrl => {
  return `automerge:${documentId}` as AutomergeUrl;
};

export function assertNever(value: never) {
  console.error('Unknown value', value);
  throw Error('Not Possible');
}

export const getDocumentUpdater = async (repo: Repo, documentId: DocumentId) => {
  const handle = repo.find<ResearchObjectDocument>(`automerge:${documentId}` as AutomergeUrl);
  console.trace({ handle: handle.isReady() }, 'Retrieved handle');

  return async (action: ManifestActions) => {
    return actionDispatcher({ action, handle, documentId });
  };
};

export const actionDispatcher = async ({
  action,
  handle,
  documentId,
}: {
  action: ManifestActions;
  handle: DocHandle<ResearchObjectDocument>;
  documentId: DocumentId;
}) => {
  if (!handle) return;
  // console.trace({ documentId, action }, 'get doc');
  let latestDocument = await handle.doc();
  // console.trace({ latestDocument }, 'retrieved doc');

  if (!latestDocument) {
    console.error({ node: documentId }, 'Automerge document not found');
    return;
  }

  // const heads = getHeads(latestDocument);
  // console.trace({ action, heads }, `DocumentUpdater::Dispatched`);

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
        console.info({ action, deleteIdx }, `DocumentUpdater::Deleteing`);
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
        console.info({ action, componentEntries }, `DocumentUpdater::Delete Components`);
        handle.change(
          (document) => {
            for (const path of componentEntries) {
              const deleteIdx = document.manifest.components.findIndex((c) => c.payload?.path === path);
              console.info({ path, deleteIdx }, `DocumentUpdater::Delete`);
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
                component.payload?.path.startsWith(action.oldPath + '/') || component.payload?.path === action.oldPath,
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
    case 'Upsert Component':
      handle.change(
        (document) => {
          upsertManifestComponent(document, action.component);
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Upsert Components':
      action.components.forEach((component) => {
        handle.change(
          (document) => {
            upsertManifestComponent(document, component);
          },
          { time: Date.now(), message: 'Upsert Component' },
        );
      });
      break;
    case 'Publish Dpid':
      handle.change(
        (document) => {
          addDpid(document, action.dpid);
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Remove Dpid':
      handle.change(
        (document) => {
          removeDpid(document);
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Pin Component':
      const componentIndex = latestDocument?.manifest.components.findIndex((c) => c.payload?.path === action.path);
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
      const index = latestDocument?.manifest.components.findIndex((c) => c.payload?.path === action.path);
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
    case 'Add Contributors':
      handle.change(
        (document) => {
          if (!document.manifest.authors) document.manifest.authors = [];
          document.manifest.authors?.push(...action.contributors);
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Set Contributors':
      handle.change(
        (document) => {
          if (!document.manifest.authors) document.manifest.authors = [];
          document.manifest.authors = action.contributors;
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Update CoverImage':
      handle.change(
        (document) => {
          if (!action.cid) {
            delete document.manifest.coverImage;
          } else {
            document.manifest.coverImage = action.cid;
          }
        },
        { time: Date.now(), message: action.type },
      );
      break;
    case 'Add Reference':
      const exists =
        latestDocument.manifest?.references &&
        latestDocument.manifest?.references?.find((ref) => ref.id === action.reference.id);

      if (!exists) {
        handle.change((document) => {
          if (!document.manifest.references) {
            document.manifest.references = [];
          }

          document.manifest.references.push(action.reference);
        });
      }
      break;
    case 'Add References':
      handle.change((document) => {
        if (!document.manifest.references) {
          document.manifest.references = [];
        }

        for (const reference of action.references) {
          if (!document.manifest.references.find((ref) => ref.id === reference.id))
            document.manifest.references.push(reference);
        }
      });
      break;
    case 'Set References':
      handle.change((document) => {
        if (!document.manifest.references) {
          document.manifest.references = [];
        }
        document.manifest.references = action.references;
      });
      break;
    case 'Delete Reference':
      if (!action.referenceId) return;
      const deletedIdx = latestDocument.manifest.references?.findIndex((ref) => ref.id === action.referenceId);
      if (deletedIdx !== undefined && deletedIdx !== -1) {
        handle.change((document) => {
          document.manifest.references?.splice(deletedIdx, 1);
        });
      }
      break;
    case 'Add Topic':
      if (action.topic !== '' && latestDocument.manifest.researchFields?.includes(action.topic)) {
        handle.change((document) => {
          if (!document.manifest.researchFields) {
            document.manifest.researchFields = [];
          }
          document.manifest.researchFields?.push(action.topic);
        });
      }
      break;
    case 'Set Topics':
      handle.change((document) => {
        document.manifest.researchFields = [...new Set(action.topics)];
      });
      break;
    case 'Remove Topic':
      handle.change((document) => {
        if (!document.manifest?.researchFields) return;

        const index = document.manifest.researchFields?.findIndex(
          (t) => t.toLowerCase() === action.topic.toLowerCase(),
        );
        if (index !== -1) {
          document.manifest.researchFields?.splice(index, 1);
        }
      });
      break;
    case 'Add Keyword':
      handle.change((document) => {
        if (!document.manifest.keywords) document.manifest.keywords = [];
        if (!document.manifest.keywords?.includes(action.keyword)) {
          document.manifest.keywords?.push(action.keyword);
        }
      });

      break;
    case 'Set Keywords':
      handle.change((document) => {
        document.manifest.keywords = [...new Set(action.keywords)];
      });
      break;
    case 'Remove Keyword':
      handle.change((document) => {
        if (!document.manifest?.keywords) return;

        const index = document.manifest.keywords?.findIndex(
          (k: string) => k.toLowerCase() === action.keyword.toLowerCase(),
        );
        if (index !== -1) {
          document.manifest.keywords?.splice(index, 1);
        }
      });
      break;
    default:
      assertNever(action);
  }

  // console.trace({ documentId }, 'get updated doc');
  latestDocument = await handle.doc();
  // console.trace({ action }, 'retrieved updated doc');

  if (latestDocument) {
    const updatedHeads = getHeads(latestDocument);
    console.trace({ action, heads: updatedHeads }, `DocumentUpdater::Exit`);
  }
  return latestDocument;
};

const updateComponentTypeMap = (
  doc: Doc<ResearchObjectDocument>,
  path: string,
  compTypeMap: ResearchObjectComponentTypeMap,
): void => {
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

const addManifestComponent = (doc: Doc<ResearchObjectDocument>, component: ResearchObjectV1Component): void => {
  doc.manifest.components.push(component);
};

const deleteComponent = (doc: Doc<ResearchObjectDocument>, path: string): void => {
  const deleteIdx = doc.manifest.components.findIndex((component) => component?.payload?.path === path);
  if (deleteIdx !== -1) doc.manifest.components.splice(deleteIdx, 1);
};

const togglePin = (doc: Doc<ResearchObjectDocument>, componentIndex: number, pin: boolean): void => {
  const currentComponent = doc.manifest.components[componentIndex];
  currentComponent.starred = pin;
};

const addDpid = (doc: Doc<ResearchObjectDocument>, dpid: ResearchObjectV1Dpid): void => {
  if (doc.manifest.dpid) return;
  doc.manifest.dpid = dpid;
};

/** In an unavailable optimistic dPID was written to the manifest, it must
 * be removed again.
 */
const removeDpid = (doc: Doc<ResearchObjectDocument>): void => {
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

const upsertManifestComponent = (doc: Doc<ResearchObjectDocument>, component: ResearchObjectV1Component): void => {
  // Check for existing component
  const existingComponentIndex = doc.manifest.components.findIndex(
    (c) => c.id === component.id || c.payload?.path === component.payload?.path,
  );
  // Apply changess
  if (existingComponentIndex !== -1) {
    const existingComponent = doc.manifest.components[existingComponentIndex];
    doc.manifest.components[existingComponentIndex] = {
      ...existingComponent,
      ...component,
      payload: { ...existingComponent.payload, ...component.payload },
    };
  } else {
    // Push the component
    doc.manifest.components.push(component);
  }
};

// eslint-disable-next-line @typescript-eslint/ban-types
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
