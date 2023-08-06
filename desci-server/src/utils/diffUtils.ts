import { DriveObject, DrivePath, FileType, neutralizePath } from '@desci-labs/desci-models';

export type TreeDiffObject = {
  entries: DrivePath[];
  count: number;
};
export interface TreeDiff {
  added: TreeDiffObject;
  removed: TreeDiffObject;
  modified: TreeDiffObject;
}

interface DiffTreeOptions {
  pruneThreshold?: number;
  onThresholdExceeded?: {
    onlyDirectories?: boolean;
  };
}

export function diffTrees(treeA: DriveObject[], treeB: DriveObject[], options: DiffTreeOptions = {}) {
  const diff = {
    added: { entries: [], count: 0 },
    removed: { entries: [], count: 0 },
    modified: { entries: [], count: 0 },
  };

  const treeAMap = treeA.reduce((acc, node) => {
    acc[neutralizePath(node.path)] = node;
    return acc;
  }, {});

  const treeBMap = treeB.reduce((acc, node) => {
    acc[neutralizePath(node.path)] = node;
    return acc;
  }, {});

  const prune = (category) => {
    if (
      options.pruneThreshold &&
      diff[category].count > options.pruneThreshold &&
      options.onThresholdExceeded?.onlyDirectories
    ) {
      diff[category].entries = diff[category].entries.filter((path) => treeAMap[path]?.type === FileType.DIR);
    }
  };

  Object.keys(treeAMap).forEach((path) => {
    if (!treeBMap[path]) {
      diff.added.entries.push(path);
      diff.added.count++;
    } else if (treeAMap[path].cid !== treeBMap[path].cid) {
      diff.modified.entries.push(path);
      diff.modified.count++;
    }
  });

  Object.keys(treeBMap).forEach((path) => {
    if (!treeAMap[path]) {
      diff.removed.entries.push(path);
      diff.removed.count++;
    }
  });

  prune('added');
  prune('removed');
  prune('modified');

  return diff;
}

type NumericObject = {
  [key: string]: number;
};

export function subtractObjectValues(objA: NumericObject, objB: NumericObject): NumericObject {
  const result: NumericObject = { ...objA };

  for (const [key, value] of Object.entries(objB)) {
    if (result.hasOwnProperty(key)) {
      result[key] -= value;
    } else {
      result[key] = -value;
    }
  }

  return result;
}
