import { ResearchObjectComponentType, ResearchObjectV1, ResearchObjectV1Component } from '@desci-labs/desci-models';
import { DataType } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { persistManifest } from 'controllers/datasets';
import { createDag, createEmptyDag, FilesToAddToDag, getDirectoryTree } from 'services/ipfs';
import { ensureUniqueString } from 'utils';
import { recursiveFlattenTree } from 'utils/driveUtils';

/* 
upgrades the manifest from the old opiniated version to the unopiniated version 
IMPORTANT: Called after ensureUser and multer
*/
export const upgradeManifestTransformer = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const { uuid, manifest } = req.body;
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);

  // Verify node ownership
  const node = await prisma.node.findFirst({
    where: {
      ownerId: owner.id,
      uuid: uuid + '.',
    },
  });
  if (!node) {
    next();
    return;
  }

  const hasDataBucket =
    manifestObj?.components[0].type === ResearchObjectComponentType.DATA_BUCKET
      ? true
      : manifestObj?.components.find((c) => c.type === ResearchObjectComponentType.DATA_BUCKET);

  if (hasDataBucket) {
    next();
    return;
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
        researchReportsDagFiles[c.name] = { cid: c.payload.url };
        c.payload.path = path;
        return;
      case ResearchObjectComponentType.CODE:
        path = ensureUniqueString(`${rootPath}/${codeReposPath}/${c.name}`, pathsEncountered);
        pathsEncountered.push(path);
        uniqueName = path.split('/').pop();
        if (uniqueName !== c.name) c.name = uniqueName;
        codeReposDagFiles[c.name] = { cid: c.payload.url };
        c.payload.path = path;
        return;
      case ResearchObjectComponentType.DATA:
        path = ensureUniqueString(`${rootPath}/${dataPath}/${c.name}`, pathsEncountered);
        pathsEncountered.push(path);
        uniqueName = path.split('/').pop();
        if (uniqueName !== c.name) c.name = uniqueName;
        dataDagFiles[c.name] = { cid: c.payload.cid };
        c.payload.path = path;
        // debugger;
        return;
      default:
        return;
    }
  });

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

  const dataBucketComponent: ResearchObjectV1Component = {
    id: 'root',
    name: 'root',
    type: ResearchObjectComponentType.DATA_BUCKET,
    payload: {
      cid: rootDagCidStr,
    },
  };

  manifestObj.components.push(dataBucketComponent);
  const dagTree = await getDirectoryTree(rootDagCid);
  const flatTree = recursiveFlattenTree(dagTree);
  // debugger;

  // Migrate old refs, add new refs
  const oldDataRefs = await prisma.dataReference.findMany({
    where: { nodeId: node.id, userId: owner.id, type: { not: DataType.MANIFEST } },
  });
  const oldRefsToUpsert = oldDataRefs.map((e) => {
    let path: string;
    if (e.path) {
      const splitPath = e.path.split('/');
      splitPath.shift();
      const cidlessPath = splitPath.join('/');
      const match = flatTree.find((f) => f.path.includes(cidlessPath));
      path = match ? match.path : flatTree.find((f) => f.cid === e.cid).path;
    } else {
      const match = flatTree.find((f) => f.cid === e.cid);
      path = match.path;
    }
    return {
      id: e.id,
      cid: e.cid,
      root: e.cid === rootDagCidStr,
      rootCid: rootDagCidStr,
      path: path,
      type: DataType.DATASET,
      userId: owner.id,
      nodeId: node.id,
      directory: e.directory,
      size: e.size || 0,
    };
  });
  const newRefsToUpsert = Object.entries(rootDagFiles).map(([name, { cid }]) => {
    return {
      id: 0,
      cid: cid.toString(),
      root: false,
      rootCid: rootDagCidStr,
      path: rootDagCidStr + '/' + name,
      type:
        name === dataPath ? DataType.DATASET : name === researchReportPath ? DataType.DOCUMENT : DataType.CODE_REPOS,
      userId: owner.id,
      nodeId: node.id,
      directory: true,
      size: 0,
    };
  });
  const refsToUpsert = [...oldRefsToUpsert, ...newRefsToUpsert];

  const upserts = await prisma.$transaction(
    refsToUpsert.map((fd) => {
      const refId = fd.id;
      delete fd.id;
      return prisma.dataReference.upsert({
        where: {
          id: refId,
        },
        update: {
          ...fd,
        },
        create: {
          ...fd,
        },
      });
    }),
  );
  if (upserts) console.log(`[UNOPINIATED DATA TRANSFORMER] ${upserts.length} new data references added/modified`);

  // Persist new manifest to db
  const { persistedManifestCid } = await persistManifest({ manifest: manifestObj, node, userId: owner.id });
  if (!persistedManifestCid)
    throw Error(`Failed to persist manifest during upgrade, node: ${node}, userId: ${owner.id}`);

  next();
  return;
};
