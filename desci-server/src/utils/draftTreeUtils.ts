import { DrivePath, FileType, RecursiveLsResult, recursiveFlattenTree } from '@desci-labs/desci-models';
import { DraftNodeTree, Node, User } from '@prisma/client';

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
): Array<Partial<DraftNodeTree>> {
  const flatIpfsTree = recursiveFlattenTree(ipfsTree);
  const draftNodeTreeEntries: Array<Partial<DraftNodeTree>> = [];

  flatIpfsTree.forEach((fd) => {
    const timestampEntry = timestampMap?.[fd.path];
    const draftNodeTreeEntry: Partial<DraftNodeTree> = {
      cid: fd.cid,
      size: fd.size,
      directory: fd.type === FileType.DIR,
      path: fd.path,
      external: fd.external,
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
      external,
    };
    flatIpfsTree.push(flatIpfsTreeEntry);
  });
  return flatIpfsTree;
}
