// @ts-nocheck
// TODO: Remove @ts-nocheck and fix 15 implicit any type errors
// This file needs proper typing for diff operations and object mapping
import { ComponentStats, DriveObject, DrivePath, FileType, neutralizePath } from '@desci-labs/desci-models';

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
    const treeMap = category === 'removed' ? treeBMap : treeAMap;
    if (
      options.pruneThreshold &&
      diff[category].count > options.pruneThreshold &&
      options.onThresholdExceeded?.onlyDirectories
    ) {
      diff[category].entries = diff[category].entries.filter((path) => treeMap[path]?.type === FileType.DIR);
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

type NestedNumericObject = {
  [key: string]: { [key: string]: number };
};

export function subtractNestedObjectValues(objA: NestedNumericObject, objB: NestedNumericObject): NestedNumericObject {
  const result: NestedNumericObject = JSON.parse(JSON.stringify(objA));

  for (const outerKey in objB) {
    if (!result[outerKey]) result[outerKey] = {};
    for (const innerKey in objB[outerKey]) {
      if (result[outerKey].hasOwnProperty(innerKey)) {
        result[outerKey][innerKey] -= objB[outerKey][innerKey];
      } else {
        result[outerKey][innerKey] = -objB[outerKey][innerKey];
      }

      if (result[outerKey][innerKey] === 0) {
        delete result[outerKey][innerKey];
      }
    }
  }

  return result;
}

export function subtractComponentStats(statsA: ComponentStats, statsB: ComponentStats): ComponentStats {
  const result = {} as ComponentStats;

  result.dirs = (statsA.dirs || 0) - (statsB.dirs || 0);

  const componentTypeStatsA = { ...statsA } as any as NestedNumericObject;
  const componentTypeStatsB = { ...statsB } as any as NestedNumericObject;

  delete componentTypeStatsA.dirs;
  delete componentTypeStatsB.dirs;

  const subtractedComponentTypeStats = subtractNestedObjectValues(componentTypeStatsA, componentTypeStatsB);

  return {
    ...result,
    ...subtractedComponentTypeStats,
  };
}
