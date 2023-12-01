import { DrivePath, FileType, RecursiveLsResult, neutralizePath, recursiveFlattenTree } from '@desci-labs/desci-models';
import { DraftNodeTree, Node, Prisma, PrismaClient, User } from '@prisma/client';

export const DRAFT_CID = 'draft';

export type TimestampMap = Record<DrivePath, { createdAt: Date; updatedAt: Date }>;

/**
 * Converts an IPFS tree to an array of DraftNodeTree entries ready to be added to the DraftNodeTree table
 * @param timestampMap - Optional map that maps drive paths to their created/last modified timestamps, if not provided then they'll be generated automatically by the DB.
 */
export function ipfsDagToDraftNodeTreeEntries(
  ipfsTree: RecursiveLsResult[],
  node: Node,
  user: User,
  timestampMap?: TimestampMap,
): Prisma.DraftNodeTreeCreateManyInput[] {
  // debugger;
  const flatIpfsTree = recursiveFlattenTree(ipfsTree);
  const draftNodeTreeEntries: Prisma.DraftNodeTreeCreateManyInput[] = [];

  flatIpfsTree.forEach((fd) => {
    const timestampEntry = timestampMap?.[fd.path];
    const draftNodeTreeEntry: Prisma.DraftNodeTreeCreateManyInput = {
      cid: fd.type === FileType.FILE ? fd.cid : 'dir',
      size: fd.size,
      directory: fd.type === FileType.DIR,
      path: neutralizePath(fd.path),
      external: fd.external ?? false,
      nodeId: node.id,
      userId: user.id,
      ...(timestampEntry && { createdAt: timestampEntry.createdAt, updatedAt: timestampEntry.updatedAt }),
    };
    draftNodeTreeEntries.push(draftNodeTreeEntry);
  });

  return draftNodeTreeEntries;
}

/**
 * Converts a draftNodeTree to a flat IPFS tree, ready to be consumed by functions that take a flat IPFS tree.
 * More efficient than converting to an IPFS tree and then flattening it, when unflatenned variant is unnecessary.
 */
export function draftNodeTreeEntriesToFlatIpfsTree(draftNodeTree: DraftNodeTree[]) {
  const flatIpfsTree: RecursiveLsResult[] = [];
  draftNodeTree.forEach((entry) => {
    const { cid, size, directory, path, external } = entry;
    const flatIpfsTreeEntry: RecursiveLsResult = {
      cid,
      size,
      type: directory ? FileType.DIR : FileType.FILE,
      path,
      name: path.split('/').pop(),
      external: external ?? false,
    };
    flatIpfsTree.push(flatIpfsTreeEntry);
  });
  return flatIpfsTree;
}

/**
 * Converts a flat IPFS tree structure to a hierarchical tree structure.
 */
export function flatTreeToHierarchicalTree(flatTree: RecursiveLsResult[]): RecursiveLsResult[] {
  const treeMap = new Map<string, RecursiveLsResult>();
  const rootNodes: RecursiveLsResult[] = [];

  flatTree.forEach((node) => {
    treeMap.set(node.path, node);
    node.contains = [];
  });

  flatTree.forEach((node) => {
    const pathParts = node.path.split('/');
    pathParts.pop(); // Remove the current node part
    const parentPath = pathParts.join('/');

    if (treeMap.has(parentPath)) {
      const parentNode = treeMap.get(parentPath);
      parentNode?.contains?.push(node);
    } else {
      rootNodes.push(node); // Root node
    }
  });

  return rootNodes;
}
