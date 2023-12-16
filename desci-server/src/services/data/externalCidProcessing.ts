import {
  FileType,
  RecursiveLsResult,
  ResearchObjectComponentSubtypes,
  ResearchObjectComponentType,
  recursiveFlattenTree,
} from '@desci-labs/desci-models';
import { User, Node, Prisma } from '@prisma/client';

import { prisma } from '../../client.js';
import { persistManifest } from '../../controllers/data/utils.js';
import { logger as parentLogger } from '../../logger.js';
import { ensureUniquePathsDraftTree } from '../../services/draftTrees.js';
import {
  GetExternalSizeAndTypeResult,
  convertToCidV1,
  getExternalCidSizeAndType,
  pubRecursiveLs,
} from '../../services/ipfs.js';
import {
  FirstNestingComponent,
  addComponentsToDraftManifest,
  addComponentsToManifest,
  getTreeAndFill,
} from '../../utils/driveUtils.js';
import { getLatestManifestFromNode } from '../manifestRepo.js';

import { getManifestFromNode, updateDataReferences } from './processing.js';
import {
  createIpfsUnresolvableError,
  createManifestPersistFailError,
  createUnhandledError,
} from './processingErrors.js';

const logger = parentLogger.child({
  module: 'Services::ExternalCidProcessing',
});

interface ProcessExternalCidDataToIpfsParams {
  // files: any[];
  externalCids: any;
  user: User;
  node: Node;
  /**
   * @type {string} path to the directory to be updated
   */
  contextPath: string;
  componentType?: ResearchObjectComponentType;
  componentSubtype?: ResearchObjectComponentSubtypes;
}

/**
 * Processes external-url file uploads, currently .pdf URLs and github code repo's
 */
export async function processExternalCidDataToIpfs({
  externalCids,
  user,
  node,
  contextPath,
  componentType,
  componentSubtype,
}: ProcessExternalCidDataToIpfsParams) {
  try {
    // debugger;
    /**
     * Prepare the CIDs for addition, see if they're resolvable and get their sizes and types
     */
    const cidTypesSizes: Record<string, GetExternalSizeAndTypeResult> = {};
    if (externalCids && externalCids.length) {
      try {
        externalCids = externalCids.map((extCid) => ({ ...extCid, cid: convertToCidV1(extCid.cid) }));
        for (const extCid of externalCids) {
          const { isDirectory, size } = await getExternalCidSizeAndType(extCid.cid);
          if (size !== undefined && isDirectory !== undefined) {
            cidTypesSizes[extCid.cid] = { size, isDirectory };
          } else {
            throw new Error(`Failed to get size and type of external CID: ${extCid}`);
          }
        }
      } catch (e: any) {
        logger.warn(`[UPDATE DAG] External CID Method: ${e}`);
        throw createIpfsUnresolvableError(`Failed to resolve external CID`);
      }
    }

    /**
     * Ensure no collisions
     */
    const cidFileNames = externalCids.map((extCid) => extCid.name);
    await ensureUniquePathsDraftTree({
      nodeId: node.id,
      contextPath,
      externalUrlFilePaths: cidFileNames,
    });

    /**
     * Discover the entire tree if it's a DAG, prepare entries for the draft tree
     */
    const externalCidMap = {};
    let entriesDiscovered = [];
    // const externalDagsToPin = [];
    if (externalCids?.length && Object.keys(cidTypesSizes)?.length) {
      entriesDiscovered = [];
      for await (const extCid of externalCids) {
        const { size, isDirectory } = cidTypesSizes[extCid.cid];
        externalCidMap[extCid.cid] = { size, directory: isDirectory, path: extCid.name };
        if (isDirectory) {
          //Get external dag tree, add to external dag pin list
          let tree: RecursiveLsResult[];
          try {
            tree = await pubRecursiveLs(extCid.cid, extCid.name);
          } catch (e) {
            logger.info(
              { extCid },
              '[UPDATE ADD EXTERNAL CID] External DAG tree resolution failed, the contents within the DAG were unable to be retrieved, rejecting update.',
            );
            throw createIpfsUnresolvableError(
              `Failed resolving external dag tree, the DAG or its contents were unable to be retrieved`,
            );
          }
          const flatTree = recursiveFlattenTree(tree);
          (flatTree as RecursiveLsResult[]).forEach((file: RecursiveLsResult) => {
            cidTypesSizes[file.cid] = { size: file.size, isDirectory: file.type === FileType.DIR };
            entriesDiscovered.push({
              path: contextPath + '/' + file.path,
              cid: file.cid,
              size: file.size,
              isDirectory: file.type === FileType.DIR,
            });
            externalCidMap[file.cid] = {
              size: file.size,
              directory: file.type === FileType.DIR,
              path: contextPath + '/' + file.path,
            };
          });
        }
        // Append root
        entriesDiscovered.push({
          path: contextPath + '/' + extCid.name,
          cid: extCid.cid,
          size,
          isDirectory,
        });
      }
    }

    const newDraftTreeEntries: Prisma.DraftNodeTreeCreateManyInput[] = entriesDiscovered.map((entry) => {
      return {
        nodeId: node.id,
        // userId: user.id,
        path: entry.path,
        cid: entry.cid,
        size: entry.size,
        directory: entry.isDirectory,
        external: true,
      };
    });

    const draftTreeEntriesAdded = await prisma.draftNodeTree.createMany({
      data: newDraftTreeEntries,
      skipDuplicates: true,
    });
    logger.info(`[EXTERNAL CID] ${draftTreeEntriesAdded.count} entries added to draft tree`);

    //repull of node required, previous manifestUrl may already be stale
    const ltsNode = await prisma.node.findFirst({
      where: {
        ownerId: user.id,
        uuid: node.uuid,
      },
    });
    const ltsManifest = await getLatestManifestFromNode(ltsNode);
    let updatedManifest = ltsManifest;

    const extCidsBeingAdded = externalCids.map((extCid) => {
      return {
        name: extCid.name,
        cid: extCid.cid,
        size: cidTypesSizes[extCid.cid].size,
        isDirectory: cidTypesSizes[extCid.cid].isDirectory,
      };
    });

    // Predefine components with their types, only happens if a predefined component type is passed
    if (componentType) {
      const firstNestingComponents: FirstNestingComponent[] = extCidsBeingAdded.map((file) => {
        const neutralFullPath = contextPath + '/' + file.name;
        return {
          name: file.name,
          path: neutralFullPath,
          cid: file.cid,
          componentType,
          componentSubtype,
          star: false,
        };
      });
      updatedManifest = await addComponentsToDraftManifest(node, firstNestingComponents);
    }

    const upserts = await updateDataReferences({ node, user, updatedManifest });
    if (upserts) logger.info(`${upserts.length} new data references added/modified`);

    const { persistedManifestCid, date } = await persistManifest({ manifest: updatedManifest, node, userId: user.id });
    if (!persistedManifestCid)
      throw createManifestPersistFailError(
        `Failed to persist manifest: ${updatedManifest}, node: ${node}, userId: ${user.id}`,
      );

    const tree = await getTreeAndFill(updatedManifest, node.uuid, user.id);

    return {
      ok: true,
      value: {
        manifest: updatedManifest,
        manifestCid: persistedManifestCid,
        tree: tree,
        date: date,
      },
    };
    // SUCCESS
  } catch (error) {
    // DB status to failed
    // Socket emit to client
    logger.error({ error }, 'Error processing S3 data to IPFS');
    const controlledErr = 'type' in error ? error : createUnhandledError(error);
    return { ok: false, value: controlledErr };
  }
}
