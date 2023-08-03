import { DriveObject, DrivePath, neutralizePath } from '@desci-labs/desci-models';

export interface TreeDiff {
  added: DrivePath[];
  removed: DrivePath[];
  modified: DrivePath[];
}

export function diffTrees(treeA: DriveObject[], treeB: DriveObject[]): TreeDiff {
  const diff: TreeDiff = {
    added: [],
    removed: [],
    modified: [],
  };

  const treeAMap = treeA.reduce((acc, node) => {
    acc[neutralizePath(node.path)] = node.cid;
    return acc;
  }, {});

  const treeBMap = treeB.reduce((acc, node) => {
    acc[neutralizePath(node.path)] = node.cid;
    return acc;
  }, {});

  Object.keys(treeAMap).forEach((path) => {
    if (!treeBMap[path]) {
      diff.added.push(path);
    } else if (treeAMap[path] !== treeBMap[path]) {
      diff.modified.push(path);
    }
  });

  Object.keys(treeBMap).forEach((path) => {
    if (!treeAMap[path]) {
      diff.removed.push(path);
    }
  });

  return diff;
}
