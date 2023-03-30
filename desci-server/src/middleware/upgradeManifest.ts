import { ResearchObjectComponentType, ResearchObjectV1, ResearchObjectV1Component } from '@desci-labs/desci-models';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { persistManifest } from 'controllers/datasets';
import { createDag, FilesToAddToDag, getDirectoryTree } from 'services/ipfs';
import { ensureUniqueString } from 'utils';

/* 
upgrades the manifest from the old opiniated version to the unopiniated version 
IMPORTANT: Called after ensureUser and multer
*/
export const upgradeManifestTransformer = async (req: Request, res: Response, next: NextFunction) => {
  const owner = (req as any).user;
  const { uuid, manifest } = req.body;
  const manifestObj: ResearchObjectV1 = JSON.parse(manifest);

  //   Verify node ownership
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

  const researchReportsDagCid = await createDag(researchReportsDagFiles);
  const codeReposDagCid = await createDag(codeReposDagFiles);
  const dataDagCid = await createDag(dataDagFiles);

  const rootDagFiles: FilesToAddToDag = {
    [researchReportPath]: { cid: researchReportsDagCid },
    [codeReposPath]: { cid: codeReposDagCid },
    [dataPath]: { cid: dataDagCid },
  };
  const rootDagCid = await createDag(rootDagFiles);

  const dataBucketComponent: ResearchObjectV1Component = {
    id: 'root',
    name: 'root',
    type: ResearchObjectComponentType.DATA_BUCKET,
    payload: {
      cid: rootDagCid.toString(),
    },
  };

  manifestObj.components.push(dataBucketComponent);
  // const dagTree = await getDirectoryTree(rootDagCid);

  // Persist new manifest to db
  const { persistedManifestCid } = await persistManifest({ manifest: manifestObj, node, userId: owner.id });
  if (!persistedManifestCid)
    throw Error(`Failed to persist manifest during upgrade, node: ${node}, userId: ${owner.id}`);

  next();
  return;
};
