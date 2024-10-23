import { DataType, Node, NodeVersion, PublicDataReference } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { directStreamLookup, RawStream } from '../../services/ceramic.js';
import { getAliasRegistry, getHotWallet } from '../../services/chain.js';
import { _getIndexedResearchObjects, getIndexedResearchObjects, IndexedResearchObject } from '../../theGraph.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'ADMIN::DebugController' });

export const debugNodeHandler = async (req: Request, res: Response) => {
  const uuid = req.params.uuid;
  logger.info({ uuid }, 'handling debug query');

  const result = await debugNode(uuid);
  res.send(result);
};

type DebugAllNodesQueryParams = {
  event?: 'first_publish' | 'last_publish';
  fromDate?: string;
  toDate?: string;
};

type NodeInfo = {
  uuid: string;
  first_publish: Date;
  last_publish: Date;
};

/** Be gentle with the search scope, as it'll put a fair amount of load on
 * the ceramic node
 */
export const debugAllNodesHandler = async (
  req: Request<never, never, never, DebugAllNodesQueryParams>,
  res: Response,
) => {
  const { fromDate, toDate } = req.query;
  const event = req.query.event ?? 'last_publish';

  const startTime = new Date();

  const timeClause = makeTimeClause(event, fromDate, toDate);
  const nodes = await prisma.$queryRawUnsafe<NodeInfo[]>(`
    select uuid, first_publish, last_publish from
    (
        select
          n.uuid,
          min(nv."createdAt") as first_publish,
          max(nv."createdAt") as last_publish
        from "Node" n
        left join "NodeVersion" nv on n.id = nv."nodeId"
        where
            (nv."transactionId" is not null or nv."commitId" is not null)
        group by n.uuid
    ) as all_versions
    ${timeClause};
  `);

  logger.info({ event, fromDate, toDate, nodes }, 'found nodes matching debug range');

  const debugData = await Promise.all(
    nodes.map(async (n) => ({
      first_publish: n.first_publish,
      last_publish: n.last_publish,
      ...(await debugNode(n.uuid)),
    })),
  );

  const sortedDebugData = debugData.sort(
    (n1, n2) =>
      // Most recent first
      n2[event].getTime() - n1[event].getTime(),
  );

  const endTime = new Date();
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

  const result = {
    info: {
      startTime,
      duration: `${duration}s`,
      event,
      fromDate: fromDate ?? 'undefined',
      toDate: toDate ?? 'undefined',
    },
    summary: {
      nodesWithErrors: debugData.filter((n) => n.hasError).length,
    },
    data: sortedDebugData,
  };

  return res.send(result);
};

const makeTimeClause = (event: 'first_publish' | 'last_publish', fromDate?: string, toDate?: string) => {
  if (!fromDate && !toDate) {
    return '';
  }

  let clause = `where all_versions.${event}`;

  if (fromDate) {
    clause += ` > '${fromDate}'`;
  }

  if (toDate && fromDate) {
    clause += `and all_versions.${event} < '${toDate}'`;
  } else if (toDate) {
    clause += `< '${toDate}'`;
  }

  return clause;
};

const debugNode = async (uuid: string) => {
  const node: NodeDbClosure = await prisma.node.findFirst({
    where: {
      uuid: ensureUuidEndsWithDot(uuid),
    },
    include: {
      versions: {
        orderBy: { createdAt: 'desc' },
      },
      PublicDataReference: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const stream = await debugStream(node.ceramicStream);
  const dpid = await debugDpid(node.dpidAlias);
  const database = await debugDb(node);
  const shouldBeIndexed = database.nVersions > 0 || stream.nVersions > 0;
  const indexer = await debugIndexer(uuid, shouldBeIndexed);
  const migrationInfo = await debugMigration(uuid, stream);

  const nVersionsAgree = new Set([database.nVersions ?? 0, stream.nVersions ?? 0, indexer.nVersions ?? 0]).size === 1;

  const hasError = stream.error || dpid.error || database.error || indexer.error || !nVersionsAgree;

  return {
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    hasError,
    nVersionsAgree,
    stream,
    dpid,
    database,
    indexer,
    migrationInfo,
  };
};

type NodeDbClosure = Node & {
  versions: NodeVersion[];
  PublicDataReference: PublicDataReference[];
};

type DebugStreamResponse = {
  present: boolean;
  error: boolean;
  nVersions?: number;
  anchoring?: {
    isAnchored: boolean;
    timeLeft: number;
  };
  raw?:
    | RawStream
    | {
        err: string;
        status: number;
        body: unknown;
        msg: string;
        cause: Error;
        stack: string;
      };
};

/** Get stream state response, or an error object */
const debugStream = async (stream?: string): Promise<DebugStreamResponse> => {
  if (!stream) return { present: false, error: false };
  const raw = await directStreamLookup(stream);

  if ('err' in raw) {
    return { present: true, error: true, raw };
  }

  const isAnchored = raw.state.anchorStatus === 'ANCHORED';
  const lastCommitIx = raw.state.log.findLastIndex((l) => l.expirationTime);
  const lastCommit = raw.state.log[lastCommitIx];
  const tailAnchor = raw.state.log.slice(lastCommitIx).findLast((l) => l.type === 2);
  const timeNow = Math.floor(new Date().getTime() / 1000);
  const timeLeft = isAnchored ? lastCommit.expirationTime - tailAnchor.timestamp : lastCommit.expirationTime - timeNow;

  const anchoring = {
    isAnchored,
    timeLeft,
  };

  // Excluding anchor events
  const versions = raw.state.log.filter((l) => l.type !== 2);

  return {
    present: true,
    error: false,
    nVersions: versions.length,
    anchoring,
    raw,
  };
};

const debugDpid = async (dpid?: number) => {
  if (!dpid) return { present: false, error: false };

  let mappedStream: string;
  try {
    const wallet = await getHotWallet();
    const registry = getAliasRegistry(wallet);

    mappedStream = await registry.resolve(dpid);
  } catch (e) {
    const err = e as Error;
    return { present: true, error: true, name: err.name, msg: err.message, stack: err.stack };
  }

  if (!mappedStream) {
    return { present: true, error: true, mappedStream: null };
  }

  return { present: true, error: false, mappedStream };
};

/*
 * Checks if the theres a signature signer mismatch between the legacy contract RO and the stream
 */
const debugMigration = async (uuid?: string, stream?: DebugStreamResponse) => {
  // Establish if there is a token history
  const legacyHistory = await _getIndexedResearchObjects([uuid]);
  const legacyHistoryPresent = !!legacyHistory?.researchObjects?.length;

  // if (!legacyHistoryPresent || !stream.present)
  //   return { legacyHistory: legacyHistoryPresent, streamHistory: stream.present };

  const streamController =
    stream.present && 'state' in stream.raw ? stream.raw.state.metadata.controllers[0].split(':').pop() : undefined;
  const legacyOwner = legacyHistory.researchObjects[0]?.owner;

  // Stream Controller === Legacy Contract RO Owner Check
  const ownerMatches = streamController?.toLowerCase() === legacyOwner?.toLowerCase();

  // All Versions Migrated check
  const { researchObjects: streamResearchObjects } = await getIndexedResearchObjects([uuid]);
  const streamManifestCidsMap = streamResearchObjects[0].versions.reduce((cids, v) => ({ ...cids, [v.cid]: true }), {});
  const streamContainsAllLegacyManifestCids = legacyHistory.researchObjects[0].versions.every(
    (v) => streamManifestCidsMap[v.cid],
  );

  return {
    legacyHistory: true,
    streamHistory: !!streamController,
    ownerMatches,
    allVersionsMigrated: streamContainsAllLegacyManifestCids,
  };
};

const debugIndexer = async (uuid: string, shouldExist: boolean) => {
  let indexResult: { researchObjects: IndexedResearchObject[] };
  try {
    indexResult = await getIndexedResearchObjects([uuid]);
  } catch (e) {
    const err = e as Error;
    return { error: true, name: err.name, msg: err.message, stack: err.stack };
  }

  const result = indexResult.researchObjects[0];
  if (!result) {
    return { error: shouldExist, result: null };
  }

  return { error: false, nVersions: result.versions.length, result };
};

const debugDb = async (node: NodeDbClosure) => {
  try {
    const publishedVersions = node.versions.filter((nv) => nv.transactionId !== null || nv.commitId !== null);
    const nVersions = publishedVersions.length;

    const pubRefManifests = node.PublicDataReference.filter((pdr) => pdr.type == DataType.MANIFEST).map(
      (pdr) => pdr.cid,
    );

    const publicManifests = publishedVersions.map((v) => ({
      cid: v.manifestUrl,
      hasPdr: pubRefManifests.includes(v.manifestUrl),
    }));

    const missingManifestPubRefs = publicManifests.some((m) => !m.hasPdr);

    return {
      error: missingManifestPubRefs,
      nVersions,
      missingManifestPubRefs,
      publicManifests,
    };
  } catch (e) {
    const err = e as Error;
    return { error: true, name: err.name, msg: err.message, stack: err.stack };
  }
};
