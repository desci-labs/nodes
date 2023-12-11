import { DrivePath, FileType, RecursiveLsResult, neutralizePath, recursiveFlattenTree } from '@desci-labs/desci-models';
import { encode, prepare } from '@ipld/dag-pb';
import { DraftNodeTree, Node, Prisma, User } from '@prisma/client';
import CID from 'cids';
import UnixFS from 'ipfs-unixfs';
import { DAGNode, DAGLink } from 'ipld-dag-pb';

import prisma from 'client';
import parentLogger from 'logger';
import { client } from 'services/ipfs';
// import * as multiformats from 'multiformats';
// const dagPb = require('@ipld/dag-pb');

const logger = parentLogger.child({
  module: 'Utils::DraftTreeUtils',
});

export const DRAFT_CID = 'draft';
export const DRAFT_DIR_CID = 'dir';

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
      cid: fd.type === FileType.FILE ? fd.cid : DRAFT_DIR_CID,
      size: fd.size,
      directory: fd.type === FileType.DIR,
      path: neutralizePath(fd.path),
      external: fd.external ?? false,
      nodeId: node.id,
      // userId: user.id,
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

/*
 * Function to add a DAGNode to IPFS and return its CID
 */
async function addDagNodeToIpfs(dagNode) {
  const cid = await client.block.put(encode(prepare(dagNode)), {
    version: 1,
    format: 'dag-pb',
    pin: true,
  });
  // logger.debug(`Added DAGNode to IPFS: ${cid.toString()}`);
  return cid;
}

/*
 * Converts a draft node tree to a dag-pb tree and pins it to the IPFS node
 */
export async function dagifyAndPinDraftDbTree(nodeId: number): Promise<string> {
  // Fetch tree entries from the database
  const treeEntries = await prisma.draftNodeTree.findMany({
    where: { nodeId: nodeId },
  });
  // debugger;
  // Convert the flat tree entries to a hierarchical tree structure
  const flatTree = draftNodeTreeEntriesToFlatIpfsTree(treeEntries);
  const hierarchicalTree = flatTreeToHierarchicalTree(flatTree);
  const root = {
    contains: hierarchicalTree,
    cid: DRAFT_DIR_CID,
    size: 0,
    type: FileType.DIR,
    path: 'root',
    name: 'root',
  };

  // Function to recursively create DAGNodes from the tree structure
  async function createDagNode(treeNode: RecursiveLsResult): Promise<string> {
    if (treeNode.type === 'dir') {
      const links: DAGLink[] = [];
      // Create a new UnixFS instance for a directory
      const unixFsEntry = new UnixFS({ type: 'directory' });

      for (const child of treeNode.contains || []) {
        const childCid = await createDagNode(child);
        // logger.debug(`Child CID: ${childCid}`); // debugging

        try {
          const cidV1 = new CID(childCid);
          // Create a new DAGLink
          const link = new DAGLink(child.name, child.size, cidV1);
          links.push(link);
        } catch (error) {
          logger.error({ error, childCid }, 'Error creating CID or DAGLink');
          throw error;
        }
      }

      // Serialize the UnixFS entry to a buffer
      const buffer = unixFsEntry.marshal();
      // Create a new DAGNode with the serialized UnixFS entry
      const dagNode = new DAGNode(buffer, links);
      // Add the DAGNode to IPFS and return its CID
      const cid = await addDagNodeToIpfs(dagNode);
      return cid.toString();
    } else {
      // For files, directly return the CID
      return treeNode.cid;
    }
  }

  const rootCid = await createDagNode(root);
  return rootCid.toString();
}
