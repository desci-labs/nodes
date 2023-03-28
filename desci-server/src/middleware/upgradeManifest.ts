import { ResearchObjectComponentType, ResearchObjectV1, ResearchObjectV1Component } from '@desci-labs/desci-models';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import { createDag, FilesToAddToDag, getDirectoryTree } from 'services/ipfs';

/* 
upgrades the manifest from the old opiniated version to the unopiniated version 
IMPORTANT: Called after ensureUser
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

  manifestObj.components.forEach((c) => {
    c.starred = true;
    switch (c.type) {
      case ResearchObjectComponentType.PDF:
        researchReportsDagFiles[c.name] = { cid: c.payload.url };
        c.payload.path = `${rootPath}/${researchReportPath}/${c.name}`;
        return;
      case ResearchObjectComponentType.CODE:
        codeReposDagFiles[c.name] = { cid: c.payload.url };
        c.payload.path = `${rootPath}/${codeReposPath}/${c.name}`;
        return;
      case ResearchObjectComponentType.DATA:
        dataDagFiles[c.name] = { cid: c.payload.cid };
        c.payload.path = `${rootPath}/${dataPath}/${c.name}`;
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
  const dagTree = await getDirectoryTree(rootDagCid);

  debugger;

  //persist new manifest to db
  //uniqueness on names within same dir and IDs
  next();
  return;
};
