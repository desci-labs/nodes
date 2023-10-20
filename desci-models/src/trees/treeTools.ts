import {
  ExternalLinkComponent,
  PdfComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '../ResearchObject';
import {
  AccessStatus,
  ComponentTypesForStats,
  ComponentStats,
  DriveMetadata,
  DriveObject,
  DrivePath,
  FileDir,
  FileType,
  NODE_KEEP_FILE,
  RecursiveLsResult,
  VirtualDriveArgs,
} from './treeTypes';

export const DRIVE_NODE_ROOT_PATH = 'root';

export function fillIpfsTree(manifest: ResearchObjectV1, ipfsTree: FileDir[]) {
  const pathToCompMap = generatePathCompMap(manifest);
  const pathToDriveMap = generateFlatPathDriveMap(ipfsTree as DriveObject[]);
  const pathToSizeMap = generatePathSizeMap(pathToDriveMap); //Sources dir sizes

  const driveObjectTree = convertIpfsTreeToDriveObjectTree(
    ipfsTree as DriveObject[],
    pathToCompMap,
    pathToSizeMap,
    // {}
  );

  // Potentially keep if we want to return the root node
  // eslint-disable-next-line no-array-reduce/no-reduce
  const rootSize = driveObjectTree.reduce((acc, curr) => acc + curr.size, 0);
  const treeRoot = createVirtualDrive({
    name: 'Node Root',
    componentType: ResearchObjectComponentType.DATA_BUCKET,
    path: DRIVE_NODE_ROOT_PATH,
    contains: driveObjectTree,
    size: rootSize,
    type: FileType.DIR,
  });
  treeRoot.componentStats = calculateComponentStats(treeRoot);

  return [treeRoot];
  // return driveObjectTree;
}

export function getAncestorComponent(
  drive: DriveObject,
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>,
): ResearchObjectV1Component | null {
  const pathSplit = drive.path!.split('/');
  // < 3 === don't inherit from root
  if (pathSplit.length < 3) return null;
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToCompMap[parentPath];
    if (parent && parent.type !== ResearchObjectComponentType.UNKNOWN) {
      return parent;
    }
  }
  return null;
}

//Convert IPFS tree to DriveObject tree V2
export function convertIpfsTreeToDriveObjectTree(
  tree: DriveObject[],
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>,
  pathToSizeMap: Record<DrivePath, number>,
) {
  // tree = tree.filter((branch) => !FILTER_LIST.includes(branch.name)); // LEAVE THIS TO THE FRONTEND
  tree.forEach((branch) => {
    const fileDirBranch = branch as FileDir;
    const neutralPath = neutralizePath(branch.path!);
    branch.path = neutralPath;
    const component = pathToCompMap[branch.path!];
    const ancestorComponent: ResearchObjectV1Component | null = getAncestorComponent(branch, pathToCompMap);
    branch.componentType = component?.type || ancestorComponent?.type || ResearchObjectComponentType.UNKNOWN;

    if (component && [ResearchObjectComponentType.PDF, ResearchObjectComponentType.LINK].includes(component.type)) {
      branch.componentSubtype = (component as PdfComponent | ExternalLinkComponent).subtype;
    }
    // useful for annotation insert on file tree under a code component for example (refer to component id later)
    branch.componentId = component?.id || ancestorComponent?.id;
    branch.accessStatus = fileDirBranch.published ? AccessStatus.PUBLIC : AccessStatus.PRIVATE;

    //Determine partials
    if (!fileDirBranch.published && branch.contains && branch.contains.length) {
      const isPartial = hasPublic(branch);
      if (isPartial) branch.accessStatus = AccessStatus.PARTIAL;
    }

    if (branch.external) branch.accessStatus = AccessStatus.EXTERNAL;

    branch.metadata = inheritMetadata(branch.path, pathToCompMap);
    branch.starred = component?.starred || false;
    // branch.lastModified = formatDbDate(branch.lastModified) || tempDate; // LEAVE THIS TO FRONTEND
    if (branch.contains && branch.contains.length && branch.type === FileType.DIR) {
      branch.size = pathToSizeMap[branch.path!] || 0;
      branch.contains = convertIpfsTreeToDriveObjectTree(branch.contains, pathToCompMap, pathToSizeMap);
      branch.componentStats = calculateComponentStats(branch);
    }
  });
  return tree;
}

export function isHiddenObject(currentObject: DriveObject) {
  return (
    !currentObject ||
    (currentObject.type === FileType.FILE && currentObject.name === '.DS_Store') ||
    currentObject.name === NODE_KEEP_FILE
  );
}

export function isDirectory(currentObject: DriveObject) {
  return currentObject.type === FileType.DIR;
}

/**
 *
 * @param dirDrive Drive object to analyze
 * @returns Object with all counts and sizes of each component type
 * count should be +1 for each directory of that type and +1 for each file of that type
 */

export function calculateComponentStats(dirDrive: DriveObject) {
  const cachedStats = dirDrive.componentStats;
  if (cachedStats) {
    return cachedStats;
  }
  return dirDrive?.contains?.reduce((acc: ComponentStats, currentObject: DriveObject) => {
    /** Exclude hidden files */
    if (isHiddenObject(currentObject)) {
      return acc;
    }

    const key = currentObject.componentType as ComponentTypesForStats;

    /** Base Case for files */
    if (!isDirectory(currentObject)) {
      acc[key].count += 1;
      acc[key].size += currentObject.size;
    } else {
      acc[key].dirs += 1;
      /** Base Case for Directories */
      if (currentObject.componentStats) {
        /** If cached stats values exist */
        acc = addComponentStats(acc, currentObject.componentStats);
      } else {
        /** If cached stats values do NOT exist, calculate them */
        const res = calculateComponentStats(currentObject);
        if (res) {
          acc = addComponentStats(acc, res);
        }
      }
    }
    return acc;
  }, createEmptyComponentStats());
}

const EMPTY_COMPONENT_STAT = {
  count: 0,
  size: 0,
  dirs: 0,
};

export const createEmptyComponentStats = (): ComponentStats => ({
  unknown: { ...EMPTY_COMPONENT_STAT },
  pdf: { ...EMPTY_COMPONENT_STAT },
  code: { ...EMPTY_COMPONENT_STAT },
  data: { ...EMPTY_COMPONENT_STAT },
  // link: { ...EMPTY_COMPONENT_STAT },
});

export function addComponentStats(objA: ComponentStats, objB: ComponentStats): ComponentStats {
  const result: ComponentStats = {
    ...createEmptyComponentStats(), // ensure all stats are zeroed to start
    ...JSON.parse(JSON.stringify(objA)),
  };

  for (const key in objB) {
    const keyTyped = key as ComponentTypesForStats;

    result[keyTyped] = {
      count: objA[keyTyped].count + objB[keyTyped].count,
      size: objA[keyTyped].size + objB[keyTyped].size,
      dirs: objA[keyTyped].dirs + objB[keyTyped].dirs,
    };
  }

  return result;
}
export function hasPublic(tree: DriveObject): boolean {
  return tree.contains!.some((fd) => {
    const fdTyped = fd as FileDir;
    if (fdTyped.published) return true;
    if (fd.contains && fd.contains.length) return hasPublic(fd);
    return false;
  });
}

export function inheritMetadata(path: DrivePath, pathToCompMap: Record<DrivePath, ResearchObjectV1Component>) {
  const comp = pathToCompMap[path];
  if (comp) {
    const specificMetadata = extractComponentMetadata(comp);
    if (Object.keys(specificMetadata).length) return specificMetadata;
  }

  const pathSplit = path.split('/');
  // < 3 === don't inherit from root
  if (pathSplit.length < 3) return {};
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join('/');
    const parent = pathToCompMap[parentPath];
    if (parent) {
      const potentialMetadata = extractComponentMetadata(parent);
      if (Object.keys(potentialMetadata).length) return potentialMetadata;
    }
  }
  return {};
}

export function extractComponentMetadata(component: ResearchObjectV1Component): DriveMetadata {
  if (!component) return {};
  const metadata: DriveMetadata = {};
  const validMetadataKeys: (keyof DriveMetadata)[] = [
    'title',
    'keywords',
    'description',
    'licenseType',
    'ontologyPurl',
    'cedarLink',
    'controlledVocabTerms',
  ];

  validMetadataKeys.forEach((k) => {
    if (k in component.payload) metadata[k] = component.payload[k];
  });

  return metadata;
}

export function generatePathCompMap(manifest: ResearchObjectV1): Record<DrivePath, ResearchObjectV1Component> {
  const componentsMap: Record<DrivePath, ResearchObjectV1Component> = {};
  manifest.components.forEach((c) => {
    switch (c.type) {
      case ResearchObjectComponentType.CODE:
      case ResearchObjectComponentType.PDF:
      case ResearchObjectComponentType.DATA:
      case ResearchObjectComponentType.UNKNOWN:
        componentsMap[c.payload.path] = c;
        return;
      default:
        return;
    }
  });
  return componentsMap;
}

export function generateFlatPathDriveMap(tree: DriveObject[]): Record<DrivePath, DriveObject> {
  const contents = recursiveFlattenTree(tree);
  const map: Record<DrivePath, DriveObject> = {};
  (contents as DriveObject[]).forEach((d: DriveObject) => {
    const neutralPath = neutralizePath(d.path!);
    map[neutralPath] = d;
  });
  return map;
}

export function generatePathSizeMap(flatPathDriveMap: Record<DrivePath, DriveObject>): Record<DrivePath, number> {
  const pathSizeMap: Record<DrivePath, number> = {};
  const dirSizeMap: Record<DrivePath, number> = {};

  for (const path in flatPathDriveMap) {
    const drive = flatPathDriveMap[path];
    if (drive.type === FileType.DIR) {
      dirSizeMap[path] = 0;
    } else {
      pathSizeMap[path] = drive.size;

      let parentPath = path;
      while (parentPath) {
        const lastSlashIndex = parentPath.lastIndexOf('/');
        parentPath = lastSlashIndex >= 0 ? parentPath.substring(0, lastSlashIndex) : '';
        if (parentPath in dirSizeMap) {
          dirSizeMap[parentPath] += drive.size;
        }
      }
    }
  }

  return { ...pathSizeMap, ...dirSizeMap };
}

export function createVirtualDrive({
  name,
  componentType,
  componentId,
  size,
  contains,
  lastModified,
  accessStatus,
  componentSubtype,
  metadata,
  cid,
  parent,
  path,
  uid,
  starred,
  type,
}: VirtualDriveArgs): DriveObject {
  return {
    name,
    componentType: componentType || ResearchObjectComponentType.UNKNOWN,
    componentSubtype: componentSubtype || undefined,
    componentId: componentId || undefined,
    size: size || 0,
    contains: contains,
    lastModified: lastModified || tempDate,
    accessStatus: accessStatus || AccessStatus.PRIVATE,
    metadata: metadata || {},
    cid: cid || '',
    type: type || FileType.DIR,
    parent: parent || null,
    path: path || undefined,
    starred: starred || false,
    ...(uid && { uid: uid }),
  };
}
export const tempDate = '12/02/2022 7:00PM';

export function recursiveFlattenTree<T extends RecursiveLsResult | DriveObject>(tree: T[]): T[] {
  // eslint-disable-next-line no-array-reduce/no-reduce
  return tree.reduce((acc: T[], node: T) => {
    if (node.type === 'dir' && node.contains) {
      return acc.concat(node, recursiveFlattenTree(node.contains as T[]));
    } else {
      return acc.concat(node);
    }
  }, []);
}

export function neutralizePath(path: DrivePath) {
  if (!path.includes('/') && path.length) return 'root';
  if (path.split('/')[0] === 'root') return path;
  return path.replace(/^[^/]+/, DRIVE_NODE_ROOT_PATH);
}
export function deneutralizePath(path: DrivePath, rootCid: string) {
  if (!path.includes('/') && path.length) return rootCid;
  return path.replace(/^[^/]+/, rootCid);
}

// Clones a node removing its children to a specified depth
export function pruneNode(node: DriveObject, depth: number): DriveObject | null {
  if (depth < 0) {
    return null;
  }

  const cloned: DriveObject = { ...node };

  if (node.type === 'dir' && node.contains && depth > 0) {
    cloned.contains = node.contains
      .map((child) => pruneNode(child, depth - 1))
      .filter((n) => n !== null) as DriveObject[];
  } else {
    cloned.contains = [];
  }

  return cloned;
}

export function findAndPruneNode(root: DriveObject, path: string, depth?: number): DriveObject | null {
  if (root.path === path) {
    // If depth is undefined, return the node directly without cloning or pruning
    return depth !== undefined ? pruneNode(root, depth) : root;
  }

  if (root.type === 'dir' && root.contains) {
    for (const child of root.contains) {
      const foundNode = findAndPruneNode(child, path, depth);
      if (foundNode) {
        return foundNode;
      }
    }
  }

  return null;
}
