import { DataType, Node, NodeVersion, PublicDataReference, PublishStatus } from '@prisma/client';
import { Request, Response } from 'express';

import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { directStreamLookup, RawStream } from '../../services/ceramic.js';
import { getAliasRegistry, getHotWallet } from '../../services/chain.js';
import { PublishServices } from '../../services/PublishServices.js';
import { _getIndexedResearchObjects, getIndexedResearchObjects, IndexedResearchObject } from '../../theGraph.js';
import { ensureUuidEndsWithDot, hexToCid } from '../../utils.js';

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

type NodeDebugReport =
  | {
      createdAt: Date;
      updatedAt: Date;
      uuid: string;
      hasError: boolean;
      nVersionsAgree: boolean;
      stream: any;
      dpid: any;
      database: any;
      indexer: any;
      migration: any;
      publishStatus: DebugPublishStatusResponse;
    }
  | { hasError: true; reason: string };

const debugNode = async (uuid: string): Promise<NodeDebugReport> => {
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

  if (!node) {
    return {
      hasError: true,
      reason: 'Node not found',
    };
  }

  const stream = await debugStream(node.ceramicStream);
  const dpid = await debugDpid(node.dpidAlias);
  const database = await debugDb(node);
  const shouldBeIndexed = database.nVersions > 0 || stream.nVersions > 0;
  const indexer = await debugIndexer(uuid, shouldBeIndexed);
  const migration = await debugMigration(uuid, stream);
  const publishStatus = await debugPublishStatus(uuid);

  const nVersionsAgree = new Set([database.nVersions ?? 0, stream.nVersions ?? 0, indexer.nVersions ?? 0]).size === 1;

  const hasError = stream.error || dpid.error || database.error || indexer.error || !nVersionsAgree || migration.error;

  return {
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    uuid: node.uuid,
    hasError,
    nVersionsAgree,
    stream,
    dpid,
    database,
    indexer,
    migration,
    publishStatus,
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

type DebugPublishStatusResponse =
  | {
      present: boolean;
      error: false;
      publishStatus: PublishStatus[];
    }
  | {
      present: boolean;
      error: true;
      name: string;
      message: string;
      stack: unknown;
    };
/*
 ** PublishStatus shows the steps taken during the publish process and which have suceeded/failed/uninitialized
 */
const debugPublishStatus = async (nodeUuid: string): Promise<DebugPublishStatusResponse> => {
  try {
    const publishStatus = await PublishServices.getPublishStatusForNode(ensureUuidEndsWithDot(nodeUuid));
    return { present: true, publishStatus, error: false };
  } catch (e) {
    const err = e as Error;
    return { present: true, error: true, name: err.name, message: err.message, stack: err.stack };
  }
};

const debugDpid = async (dpidAlias?: number) => {
  if (!dpidAlias) return { present: false, error: false };

  let mappedStream: string;
  try {
    const wallet = await getHotWallet();
    const registry = getAliasRegistry(wallet);

    mappedStream = await registry.resolve(dpidAlias);
  } catch (e) {
    const err = e as Error;
    return { present: true, error: true, name: err.name, msg: err.message, stack: err.stack };
  }

  if (!mappedStream) {
    return { present: true, error: true, mappedStream: null };
  }

  return { present: true, dpidAlias, error: false, mappedStream };
};

type DebugMigrationReponse =
  | {
      error: boolean;
      hasLegacyHistory: boolean;
      hasStreamHistory: boolean;
      ownerMatches?: boolean;
      allVersionsPresent?: boolean;
      allVersionsOrdered?: boolean;
      zipped?: [string, string][];
    }
  | {
      error: true;
      name: string;
      message: string;
      stack: unknown;
    };

/*
 * Checks if the theres a signature signer mismatch between the legacy contract RO and the stream
 */
const debugMigration = async (uuid?: string, stream?: DebugStreamResponse): Promise<DebugMigrationReponse> => {
  // Establish if there is a token history
  let legacyHistoryResponse;
  try {
    legacyHistoryResponse = await _getIndexedResearchObjects([uuid]);
  } catch (err) {
    logger.error({ uuid, err }, 'Failed to query legacy history');
    return { error: true, name: err.name, message: err.message, stack: err.stack };
  }

  const hasLegacyHistory = !!legacyHistoryResponse?.researchObjects?.length;

  if (!hasLegacyHistory || !stream.present) {
    return { error: false, hasLegacyHistory, hasStreamHistory: stream.present };
  }

  const legacyHistory = legacyHistoryResponse.researchObjects[0];

  let streamHistoryResponse;
  try {
    streamHistoryResponse = await getIndexedResearchObjects([uuid]);
  } catch (err) {
    logger.error({ uuid, err }, 'Failed to query stream history');
    return { error: true, name: err.name, message: err.message, stack: err.stack };
  }

  const streamResearchObject = streamHistoryResponse.researchObjects[0];
  const streamController =
    stream.present && 'state' in stream.raw ? stream.raw.state.metadata.controllers[0].split(':').pop() : undefined;
  const legacyOwner = legacyHistory.owner;

  // Stream Controller === Legacy Contract RO Owner Check
  const ownerMatches = streamController?.toLowerCase() === legacyOwner?.toLowerCase();

  // All Versions Migrated check
  const streamManifestCids = streamResearchObject.versions.map((v) => hexToCid(v.cid)).reverse();
  const legacyManifestCids = legacyHistory.versions.map((v) => hexToCid(v.cid)).reverse();

  const zipped = Array.from(
    Array(Math.max(streamManifestCids.length, legacyManifestCids.length)),
    (_, i) => [legacyManifestCids[i], streamManifestCids[i]] as [string, string],
  );

  const allVersionsOrdered = zipped.every(([legacyCid, streamCid]) => !legacyCid || legacyCid === streamCid);
  const allVersionsPresent = legacyManifestCids.map((cid, i) => streamManifestCids[i] === cid).every(Boolean);

  return {
    error: !ownerMatches || !allVersionsPresent || !allVersionsOrdered,
    hasLegacyHistory: true,
    hasStreamHistory: !!streamController,
    ownerMatches,
    allVersionsPresent,
    allVersionsOrdered,
    zipped,
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

  const withDecodedCid = {
    ...result,
    versions: result.versions.map((v) => ({
      ...v,
      _decoded: hexToCid(v.cid),
    })),
  };

  return { error: false, nVersions: result.versions.length, result: withDecodedCid };
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
