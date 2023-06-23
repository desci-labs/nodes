import {
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from "../ResearchObject";
import {
  AccessStatus,
  DriveMetadata,
  DriveObject,
  DrivePath,
  FileDir,
  FileType,
  RecursiveLsResult,
  VirtualDriveArgs,
} from "./treeTypes";

export const DRIVE_NODE_ROOT_PATH = "root";

export function fillIpfsTree(manifest: ResearchObjectV1, ipfsTree: FileDir[]) {
  const pathToCompMap = generatePathCompMap(manifest);
  const pathToDriveMap = generateFlatPathDriveMap(ipfsTree as DriveObject[]);
  const pathToSizeMap = generatePathSizeMap(pathToDriveMap); //Sources dir sizes

  const driveObjectTree = convertIpfsTreeToDriveObjectTree(
    ipfsTree as DriveObject[],
    pathToCompMap,
    pathToSizeMap
  );

  // Potentially keep if we want to return the root node
  // eslint-disable-next-line no-array-reduce/no-reduce
  // const rootSize = driveObjectTree.reduce((acc, curr) => acc + curr.size, 0);
  // const treeRoot = createVirtualDrive({
  //   name: "Node Root",
  //   componentType: ResearchObjectComponentType.DATA_BUCKET,
  //   path: DRIVE_NODE_ROOT_PATH,
  //   contains: driveObjectTree,
  //   size: rootSize,
  // });

  // return [treeRoot];
  return driveObjectTree;
}

export function getAncestorComponent(
  drive: DriveObject,
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>
): ResearchObjectV1Component | null {
  const pathSplit = drive.path!.split("/");
  // < 3 === don't inherit from root
  if (pathSplit.length < 3) return null;
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join("/");
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
  pathToSizeMap: Record<DrivePath, number>
) {
  // tree = tree.filter((branch) => !FILTER_LIST.includes(branch.name)); // LEAVE THIS TO THE FRONTEND
  tree.forEach((branch) => {
    const fileDirBranch = branch as FileDir;
    const neutralPath = neutralizePath(branch.path!);
    branch.path = neutralPath;
    const component = pathToCompMap[branch.path!];
    const ancestorComponent: ResearchObjectV1Component | null =
      getAncestorComponent(branch, pathToCompMap);
    branch.componentType =
      component?.type ||
      ancestorComponent?.type ||
      ResearchObjectComponentType.UNKNOWN;

    if (component) {
      const subtype =
        "subtype" in component
          ? (component["subtype"] as ResearchObjectComponentSubtypes)
          : undefined;
      if (subtype) branch.componentSubtype = subtype;
    }
    // useful for annotation insert on file tree under a code component for example (refer to component id later)
    branch.componentId = component?.id || ancestorComponent?.id;
    branch.accessStatus = fileDirBranch.published
      ? AccessStatus.PUBLIC
      : AccessStatus.PRIVATE;

    //Determine partials
    if (!fileDirBranch.published && branch.contains && branch.contains.length) {
      const isPartial = hasPublic(branch);
      if (isPartial) branch.accessStatus = AccessStatus.PARTIAL;
    }

    if (branch.external) branch.accessStatus = AccessStatus.EXTERNAL;

    branch.metadata = inheritMetadata(branch.path, pathToCompMap);
    branch.starred = component?.starred || false;
    // branch.lastModified = formatDbDate(branch.lastModified) || tempDate; // LEAVE THIS TO FRONTEND
    if (
      branch.contains &&
      branch.contains.length &&
      branch.type === FileType.DIR
    ) {
      branch.size = pathToSizeMap[branch.path!] || 0;
      branch.contains = convertIpfsTreeToDriveObjectTree(
        branch.contains,
        pathToCompMap,
        pathToSizeMap
      );
    }
  });
  return tree;
}

export function hasPublic(tree: DriveObject): boolean {
  return tree.contains!.some((fd) => {
    const fdTyped = fd as FileDir;
    if (fdTyped.published) return true;
    if (fd.contains && fd.contains.length) return hasPublic(fd);
    return false;
  });
}

export function inheritMetadata(
  path: DrivePath,
  pathToCompMap: Record<DrivePath, ResearchObjectV1Component>
) {
  const comp = pathToCompMap[path];
  if (comp) {
    const specificMetadata = extractComponentMetadata(comp);
    if (Object.keys(specificMetadata).length) return specificMetadata;
  }

  const pathSplit = path.split("/");
  // < 3 === don't inherit from root
  if (pathSplit.length < 3) return {};
  while (pathSplit.length > 1) {
    pathSplit.pop();
    const parentPath = pathSplit.join("/");
    const parent = pathToCompMap[parentPath];
    if (parent) {
      const potentialMetadata = extractComponentMetadata(parent);
      if (Object.keys(potentialMetadata).length) return potentialMetadata;
    }
  }
  return {};
}

export function extractComponentMetadata(
  component: ResearchObjectV1Component
): DriveMetadata {
  if (!component) return {};
  const metadata: DriveMetadata = {};
  const validMetadataKeys: (keyof DriveMetadata)[] = [
    "title",
    "keywords",
    "description",
    "licenseType",
    "ontologyPurl",
    "cedarLink",
    "controlledVocabTerms",
  ];

  validMetadataKeys.forEach((k) => {
    if (k in component.payload) metadata[k] = component.payload[k];
  });

  return metadata;
}

export function generatePathCompMap(
  manifest: ResearchObjectV1
): Record<DrivePath, ResearchObjectV1Component> {
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

export function generateFlatPathDriveMap(
  tree: DriveObject[]
): Record<DrivePath, DriveObject> {
  const contents = recursiveFlattenTree(tree);
  const map: Record<DrivePath, DriveObject> = {};
  (contents as DriveObject[]).forEach((d: DriveObject) => {
    const neutralPath = neutralizePath(d.path!);
    map[neutralPath] = d;
  });
  return map;
}

export function generatePathSizeMap(
  flatPathDriveMap: Record<DrivePath, DriveObject>
): Record<DrivePath, number> {
  const pathSizeMap: Record<DrivePath, number> = {};
  const dirKeys: DrivePath[] = [];
  Object.entries(flatPathDriveMap).forEach(([path, drive]) => {
    if (drive.type === FileType.DIR) {
      dirKeys.push(path);
    } else {
      pathSizeMap[path] = drive.size;
    }
  });

  const dirSizeMap: Record<DrivePath, number> = {};
  dirKeys.forEach((dirPath) => {
    // eslint-disable-next-line no-array-reduce/no-reduce
    const dirSize = Object.entries(pathSizeMap).reduce(
      (acc: number, [path, size]) => {
        if (path.startsWith(dirPath)) return acc + size;
        return acc;
      },
      0
    );
    dirSizeMap[dirPath] = dirSize || 0;
  });
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
    cid: cid || "",
    type: type || FileType.DIR,
    parent: parent || null,
    path: path || undefined,
    starred: starred || false,
    ...(uid && { uid: uid }),
  };
}
export const tempDate = "12/02/2022 7:00PM";

export function recursiveFlattenTree<T extends RecursiveLsResult | DriveObject>(
  tree: T[]
): T[] {
  // eslint-disable-next-line no-array-reduce/no-reduce
  return tree.reduce((acc: T[], node: T) => {
    if (node.type === "dir" && node.contains) {
      return acc.concat(node, recursiveFlattenTree(node.contains as T[]));
    } else {
      return acc.concat(node);
    }
  }, []);
}

export function neutralizePath(path: DrivePath) {
  if (!path.includes("/") && path.length) return "root";
  return path.replace(/^[^/]+/, DRIVE_NODE_ROOT_PATH);
}
export function deneutralizePath(path: DrivePath, rootCid: string) {
  if (!path.includes("/") && path.length) return rootCid;
  return path.replace(/^[^/]+/, rootCid);
}
