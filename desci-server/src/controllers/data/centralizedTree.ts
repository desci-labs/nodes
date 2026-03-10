import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { listR2Objects, isR2Configured } from '../../services/r2.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'DATA::CentralizedTree' });

interface TreeNode {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  lastModified?: string;
  path: string;
  children?: TreeNode[];
}

function buildTreeSimple(
  objects: { key: string; size: number; lastModified: Date | undefined }[],
  prefix: string,
): TreeNode[] {
  const rootChildren: Map<string, { node: TreeNode; subObjects: typeof objects }> = new Map();

  for (const obj of objects) {
    const relativePath = obj.key.slice(prefix.length);
    if (!relativePath) continue;

    const slashIndex = relativePath.indexOf('/');
    if (slashIndex === -1) {
      // Direct file
      rootChildren.set(relativePath, {
        node: {
          name: relativePath,
          type: 'file',
          path: relativePath,
          size: obj.size,
          lastModified: obj.lastModified?.toISOString(),
        },
        subObjects: [],
      });
    } else {
      const dirName = relativePath.slice(0, slashIndex);
      if (!rootChildren.has(dirName)) {
        rootChildren.set(dirName, {
          node: {
            name: dirName,
            type: 'dir',
            path: dirName,
            children: [],
          },
          subObjects: [],
        });
      }
      rootChildren.get(dirName)!.subObjects.push(obj);
    }
  }

  const result: TreeNode[] = [];
  for (const [, { node, subObjects }] of rootChildren) {
    if (node.type === 'dir' && subObjects.length > 0) {
      const subPrefix = prefix + node.name + '/';
      node.children = buildTreeSimple(subObjects, subPrefix);
    }
    result.push(node);
  }

  return result.sort((a, b) => {
    // Dirs first, then alphabetical
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export const centralizedTree = async (req: Request, res: Response) => {
  const nodeUuid = req.params.nodeUuid;

  if (!isR2Configured) {
    return res.status(503).send({ ok: false, message: 'R2 storage is not configured' });
  }

  if (!nodeUuid) {
    return res.status(400).json({ ok: false, message: 'No node UUID provided' });
  }

  const normalizedUuid = ensureUuidEndsWithDot(nodeUuid);

  logger.info({ nodeUuid: normalizedUuid }, 'Fetching centralized tree');

  // Metadata (tree structure) is public — no auth required
  // Verify the node exists
  const node = await prisma.node.findFirst({
    where: { uuid: normalizedUuid },
  });

  if (!node) {
    return res.status(404).json({ ok: false, message: 'Node not found' });
  }

  try {
    const prefix = `${normalizedUuid}/`;
    const objects = await listR2Objects(prefix);

    const pathFilter = req.query.path as string | undefined;
    let filteredObjects = objects;
    if (pathFilter) {
      const filterPrefix = `${normalizedUuid}/${pathFilter}`;
      filteredObjects = objects.filter((obj) => obj.key.startsWith(filterPrefix));
    }

    const treePrefix = pathFilter ? `${normalizedUuid}/${pathFilter}` : prefix;
    // Ensure treePrefix ends with /
    const normalizedTreePrefix = treePrefix.endsWith('/') ? treePrefix : treePrefix + '/';
    const tree = buildTreeSimple(filteredObjects, normalizedTreePrefix);

    return res.status(200).json({ tree, date: new Date().toISOString() });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch centralized tree');
    return res.status(500).json({ ok: false, message: 'Failed to retrieve tree' });
  }
};
