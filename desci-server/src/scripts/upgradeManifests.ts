import {
  isNodeRoot,
  recursiveFlattenTree,
  ResearchObjectComponentType,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { PersistManifestParams } from '../controllers/data/utils.js';
import { cleanupManifestUrl } from '../controllers/nodes/show.js';
import {
  createDag,
  createEmptyDag,
  FilesToAddToDag,
  getDirectoryTree,
  strIsCid,
  updateManifestAndAddToIpfs,
} from '../services/ipfs.js';
import { ensureUniqueString } from '../utils.js';
/* 
upgrades the manifest from the old opiniated version to the unopiniated version 
IMPORTANT: Called after ensureUser and multer
*/
// eslint-disable-next-line @typescript-eslint/no-var-requires
// import { addToDir, concat, getSize, makeDir, updateDagCid } from '../utils/dagConcat.js';
import { addComponentsToManifest } from '../utils/driveUtils.js';

upgradeManifestsScript();
export async function upgradeManifestsScript() {
  //   const owner = (req as any).user;

  const nodes = await prisma.node.findMany({
    orderBy: {
      id: 'asc',
    },
  });
  console.log(`[TRANSFORMER]Nodes found: ${nodes.length}`);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    console.log(`[TRANSFORMER]Transforming node ${i}, node uuid: ${node.uuid}, nodeId: ${node.id}`);
    let manifestObj;
    // const uuid = node.uuid;
    try {
      const manifestUrl = cleanupManifestUrl(node.manifestUrl);
      manifestObj = (await axios.get(manifestUrl)).data;
      if (!manifestObj) throw 'Manifest not found';
    } catch (e) {
      console.log(
        `[TRANSFORMER]Failed to fetch manifest, skipping nodeId: ${node.id}, uuid: ${node.uuid}, error: ${e}`,
      );
      continue;
      // process.exit(404);
    }
    // Verify node ownership
    // const node = await prisma.node.findFirst({
    //   where: {
    //     ownerId: owner.id,
    //     uuid: uuid + '.',
    //   },
    // });
    //   if (!node) {
    //     next();
    //     return;
    //   }

    const hasDataBucket =
      manifestObj?.components[0]?.type === ResearchObjectComponentType.DATA_BUCKET
        ? true
        : manifestObj?.components.find((c) => isNodeRoot(c));

    if (hasDataBucket) {
      //skip
      console.log(`[TRANSFORMER SKIPPED]Skipped node ${i}, node uuid: ${node.uuid}`);
      continue;
    }
    //Old version upgrade logic
    const researchReportPath = 'Research Reports';
    const codeReposPath = 'Code Repositories';
    const dataPath = 'Data';
    const rootPath = 'root';

    const researchReportsDagFiles: FilesToAddToDag = {};
    const codeReposDagFiles: FilesToAddToDag = {};
    const dataDagFiles: FilesToAddToDag = {};

    const idsEncountered = [];
    const pathsEncountered = [];

    try {
      manifestObj.components.forEach((c) => {
        const uniqueId = ensureUniqueString(c.id, idsEncountered);
        idsEncountered.push(uniqueId);
        if (c.id !== uniqueId) c.id = uniqueId;
        c.starred = true;
        let path: string;
        let uniqueName: string;
        switch (c.type) {
          case ResearchObjectComponentType.PDF:
            path = ensureUniqueString(`${rootPath}/${researchReportPath}/${c.name}`, pathsEncountered);
            pathsEncountered.push(path);
            uniqueName = path.split('/').pop();
            if (uniqueName !== c.name) c.name = uniqueName;
            if (strIsCid(c.payload.url)) {
              researchReportsDagFiles[c.name] = { cid: c.payload.url };
            } else if (strIsCid(c.payload.url.split('/').pop())) {
              researchReportsDagFiles[c.name] = { cid: c.payload.url.split('/').pop() };
            } else {
              console.log(
                `[TRANSFORMER]Invalid PDF cid, skipping nodeId: ${node.id}, uuid: ${node.uuid}, cid provided: ${c.payload.url}`,
              );
              throw 'Invalid PDF cid';
            }
            c.payload.path = path;
            return;
          case ResearchObjectComponentType.CODE:
            path = ensureUniqueString(`${rootPath}/${codeReposPath}/${c.name}`, pathsEncountered);
            pathsEncountered.push(path);
            uniqueName = path.split('/').pop();
            if (uniqueName !== c.name) c.name = uniqueName;
            if (strIsCid(c.payload.url)) {
              codeReposDagFiles[c.name] = { cid: c.payload.url };
            } else if (strIsCid(c.payload.url.split('/').pop())) {
              codeReposDagFiles[c.name] = { cid: c.payload.url.split('/').pop() };
            } else {
              console.log(
                `[TRANSFORMER]Invalid Code cid, skipping nodeId: ${node.id}, uuid: ${node.uuid}, cid provided: ${c.payload.url}`,
              );
              throw 'Invalid Code cid';
            }
            c.payload.path = path;
            return;
          case ResearchObjectComponentType.DATA:
            path = ensureUniqueString(`${rootPath}/${dataPath}/${c.name}`, pathsEncountered);
            pathsEncountered.push(path);
            uniqueName = path.split('/').pop();
            if (uniqueName !== c.name) c.name = uniqueName;
            dataDagFiles[c.name] = { cid: c.payload.cid };
            c.payload.path = path;
            return;
          default:
            return;
        }
      });
    } catch (e) {
      console.log(e);
      continue;
      // process.exit(404);
    }

    const emptyDag = await createEmptyDag();

    const researchReportsDagCid = Object.entries(researchReportsDagFiles).length
      ? await createDag(researchReportsDagFiles)
      : emptyDag;
    const codeReposDagCid = Object.entries(codeReposDagFiles).length ? await createDag(codeReposDagFiles) : emptyDag;
    const dataDagCid = Object.entries(dataDagFiles).length ? await createDag(dataDagFiles) : emptyDag;

    const rootDagFiles: FilesToAddToDag = {
      [researchReportPath]: { cid: researchReportsDagCid },
      [codeReposPath]: { cid: codeReposDagCid },
      [dataPath]: { cid: dataDagCid },
    };
    const rootDagCid = await createDag(rootDagFiles);
    const rootDagCidStr = rootDagCid.toString();

    const opinionatedDirsFormatted = Object.entries(rootDagFiles).map(([path, { cid }]) => {
      return {
        name: path,
        path: 'root/' + path,
        cid: cid.toString(),
        componentType:
          path === researchReportPath
            ? ResearchObjectComponentType.PDF
            : path === codeReposPath
            ? ResearchObjectComponentType.CODE
            : ResearchObjectComponentType.DATA,
      };
    });

    const dataBucketComponent: ResearchObjectV1Component = {
      id: 'root',
      name: 'root',
      type: ResearchObjectComponentType.DATA_BUCKET,
      payload: {
        cid: rootDagCidStr,
      },
    };
    manifestObj.components.unshift(dataBucketComponent);
    manifestObj = addComponentsToManifest(manifestObj, opinionatedDirsFormatted);

    const dagTree = await getDirectoryTree(rootDagCid, {});
    const flatTree = recursiveFlattenTree(dagTree);
    // debugger;
    // Migrate old refs, add new refs
    const oldDataRefs = await prisma.dataReference.findMany({
      where: { nodeId: node.id, userId: node.ownerId, type: { not: DataType.MANIFEST } },
    });

    const dataRefIds = oldDataRefs.map((e) => e.id);

    const formattedPruneList = oldDataRefs.map((e) => {
      return {
        description: '[TRANSFORMER::UNOPINIONATED RO UPGRADE]',
        cid: e.cid,
        type: e.type,
        size: e.size,
        nodeId: e.nodeId,
        userId: e.userId,
        directory: e.directory,
      };
    });

    const pathToTypeMap = {};
    Object.entries(rootDagFiles).forEach(([name, { cid }]) => {
      pathToTypeMap[rootDagCidStr + '/' + name] =
        name === dataPath ? DataType.DATASET : name === researchReportPath ? DataType.DOCUMENT : DataType.CODE_REPOS;
    });

    const treeRefsToUpsert: any = flatTree.map((e) => {
      let dbType = DataType.UNKNOWN;
      if (e.path in pathToTypeMap) {
        dbType = pathToTypeMap[e.path];
      }
      return {
        cid: e.cid,
        root: e.cid === rootDagCidStr,
        rootCid: rootDagCidStr,
        path: e.path,
        type: dbType,
        userId: node.ownerId,
        nodeId: node.id,
        directory: e.type === 'dir' ? true : false,
        size: e.size || 0,
      };
    });

    treeRefsToUpsert.push({
      cid: rootDagCidStr,
      root: true,
      rootCid: rootDagCidStr,
      path: rootDagCidStr,
      type: DataType.DATA_BUCKET,
      userId: node.ownerId,
      nodeId: node.id,
      directory: true,
      size: 0,
    } as any);

    const [deleteResult, pruneResult, createResult] = await prisma.$transaction([
      prisma.dataReference.deleteMany({ where: { id: { in: dataRefIds } } }),
      prisma.cidPruneList.createMany({ data: formattedPruneList }),
      prisma.dataReference.createMany({ data: treeRefsToUpsert }),
    ]);
    console.log(
      `[UNOPINIONATED DATA TRANSFORMER] ${deleteResult.count} dataReferences deleted, ${pruneResult.count} cidPruneList entries added, ${createResult.count} new dataReferences created.`,
    );

    manifestObj.version = 'desci-nodes-0.2.0';
    // Persist new manifest to db
    const { persistedManifestCid } = await persistManifestTimePreserved({
      manifest: manifestObj,
      node,
      userId: node.ownerId,
      updatedAt: node.updatedAt,
    });
    if (!persistedManifestCid)
      throw Error(`Failed to persist manifest during upgrade, node: ${node}, userId: ${node.ownerId}`);
    console.log(`[TRANSFORMER]iteration ${i} successfully completed, node uuid: ${node.uuid}, nodeId: ${node.id}`);
  }
}

export async function persistManifestTimePreserved({
  manifest,
  node,
  userId,
  updatedAt,
}: PersistManifestParams & { updatedAt: Date }) {
  if (node.ownerId !== userId) {
    console.log(`User: ${userId} doesnt own node ${node.id}`);
    throw Error(`User: ${userId} doesnt own node ${node.id}`);
  }

  try {
    const {
      cid,
      ref: dataRef,
      nodeVersion,
    } = await updateManifestAndAddToIpfs(manifest, { userId: node.ownerId, nodeId: node.id });

    const updated = await prisma.node.update({
      where: {
        id: node.id,
      },
      data: {
        manifestUrl: cid,
        updatedAt,
      },
    });

    if (updated && nodeVersion && dataRef) return { persistedManifestCid: cid, date: dataRef.updatedAt, nodeVersion };
  } catch (e: any) {
    console.error(`failed persisting manifest, manifest: ${manifest}, dbnode: ${node}, userId: ${userId}, e: ${e}`);
  }
  return { persistedManifestCid: null, date: null };
}
