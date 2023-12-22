//This tests

import fs from 'fs';
import path from 'path';

import {
  isNodeRoot,
  recursiveFlattenTree,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';

import { createDag, createEmptyDag, FilesToAddToDag, getDirectoryTree, strIsCid } from '../services/ipfs.js';
import { addComponentsToManifest } from '../utils/driveUtils.js';
import { ensureUniqueString } from '../utils.js';

/* 
This script only tests the DAG step, and only a manifest is required, no DB entries are required
*/

interface Manifest {
  fileName: string;
  content: string;
}

async function loadFiles(folderPath: string): Promise<Manifest[]> {
  const fileNames = fs.readdirSync(folderPath);
  const manifests: Manifest[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(folderPath, fileName);
    const fileContent = await fs.promises.readFile(filePath, 'utf-8');
    manifests.push({ fileName: fileName, content: fileContent });
  }

  return manifests;
}

testUpgradeManifests();
export async function testUpgradeManifests() {
  const manifests = await loadFiles('./src/scripts/manifests');

  console.log(`[TRANSFORMER]Manifests found: ${manifests.length}`);

  for (let i = 0; i < manifests.length; i++) {
    const manifest = manifests[i];
    console.log(`[TRANSFORMER]Transforming manifest ${i}, manifest name: ${manifest.fileName}`);
    let manifestObj = JSON.parse(manifest.content) as ResearchObjectV1;

    const hasDataBucket =
      manifestObj?.components[0]?.type === ResearchObjectComponentType.DATA_BUCKET
        ? true
        : manifestObj?.components.find((c) => isNodeRoot(c));

    if (hasDataBucket) {
      //skip
      console.log(`[TRANSFORMER SKIPPED]Skipped manifest ${i}, manifest name: ${manifest.fileName}`);
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
                `[TRANSFORMER]Invalid PDF cid, skipping manifest: ${manifest.fileName}, cid provided: ${c.payload.url}`,
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
                `[TRANSFORMER]Invalid code cid, skipping manifest: ${manifest.fileName}, cid provided: ${c.payload.url}`,
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
    console.log(`[TRANSFORMER]iteration ${i} completed, manifest name:${manifest.fileName}`);
  }
}
