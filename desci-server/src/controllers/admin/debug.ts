import { Request, Response } from 'express';
import { logger as parentLogger } from '../../logger.js';
import { prisma } from '../../client.js';
import { Node, NodeVersion, Prisma, PublicDataReference } from '@prisma/client';
import { ensureUuidEndsWithDot } from '../../utils.js';
import { directStreamLookup } from '../../services/ceramic.js';
import { getAliasRegistry, getHotWallet } from '../../services/chain.js';
import { getIndexedResearchObjects, IndexedResearchObject } from '../../theGraph.js';

const logger = parentLogger.child({ module: 'ADMIN::DebugController' });

export const debugNodeHandler = async (
  req: Request,
  res: Response,
) => {
  const uuid = req.params.uuid;
  logger.info({ uuid }, "handling debug query");

  const result = await debugNode(uuid);
  res.send(result);
};

type DebugAllNodesQueryParams = {
  fromDate?: string,
  toDate?: string,
  timeColumn?: "createdAt" | "updatedAt",
};

export const debugAllNodesHandler = async (
  req: Request<never, never, never, DebugAllNodesQueryParams>,
  res: Response,
) => {
  const { fromDate, toDate, timeColumn } = req.query;

  const nodes = await prisma.node.findMany({
    select: {
      uuid: true,
    },
    where: makeTimeFilter(timeColumn ?? "createdAt", { fromDate, toDate }),
  });
  logger.info(
    { ...req.query, uuids: nodes.map(n => n.uuid) },
    "handling debugAll query",
  );

  const results = await Promise.all(
    nodes.map(async n => await debugNode(n.uuid))
  );
  res.send(results);
};

const debugNode = async (uuid: string) => {
  const node = await prisma.node.findFirst({
    where: {
      uuid: ensureUuidEndsWithDot(uuid),
    },
    include: {
      versions: true,
      PublicDataReference: true,
    },
  });

  const streamDebugData = await debugStream(node.ceramicStream);
  const dpidDebugData = await debugDpid(node.dpidAlias);
  const dbDebugData = await debugDb(node);
  const shouldBeIndexed: boolean = node.versions
    .findIndex(v =>
      v.transactionId !== null || v.commitId !== null
    ) > -1;
  const indexerDebugData = await debugIndexer(uuid, shouldBeIndexed);

  const hasError = streamDebugData.error
    || dpidDebugData.error
    || dbDebugData.error
    || indexerDebugData.error;

  return {
    uuid,
    hasError,
    stream: streamDebugData,
    dpid: dpidDebugData,
    db: dbDebugData,
    indexer: indexerDebugData,
  };
};

const makeTimeFilter = (
  timeColumn: "createdAt" | "updatedAt",
  bounds: { fromDate?: string, toDate?: string }
): Prisma.NodeWhereInput => {
  const { fromDate, toDate } = bounds;

  let filter: Prisma.DateTimeFilter = {};

  if (fromDate) {
    filter.gte = new Date(fromDate).toISOString();
  };

  if (toDate){
    filter.lte = new Date(toDate).toString();
  };

  return { [timeColumn]: filter };
};

type NodeDbClosure = Node & {
  versions: NodeVersion[],
  PublicDataReference: PublicDataReference[],
};

/** Get stream state response, or an error object */
const debugStream = async (
  stream?: string
) => {
  if (!stream) return { present: false, error: false };
  const raw = await directStreamLookup(stream);

  if ("err" in raw) {
    return { present: true, error: true, raw };
  };

  const isAnchored = raw.state.anchorStatus === "ANCHORED";
  const lastCommitIx = raw.state.log.findLastIndex(l => l.expirationTime);
  const lastCommit = raw.state.log[lastCommitIx];
  const tailAnchor = raw.state.log
    .slice(lastCommitIx)
    .findLast(l => l.type === 2);
  const timeNow = Math.floor(new Date().getTime() / 1000);
  const timeLeft = isAnchored
    ? lastCommit.expirationTime - tailAnchor.timestamp
    : lastCommit.expirationTime - timeNow;

  const anchoring = {
    isAnchored,
    timeLeft
  };

  // Excluding anchor events
  const versions = raw.state.log.filter(l => l.type !== 2);

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

  const wallet = await getHotWallet();
  const registry = getAliasRegistry(wallet);

  const mappedStream = await registry.resolve(dpid);
  if (!mappedStream) {
    return { present: true, error: true, mappedStream: null };
  };

  return { present: true, error: false, mappedStream };
};

const debugIndexer = async (
  uuid: string,
  shouldExist: boolean
) => {
  let indexResult: { researchObjects: IndexedResearchObject[] };
  try {
    indexResult = await getIndexedResearchObjects([uuid]);
  } catch (e) {
    const err = e as Error;
    return { error: true, name: err.name, msg: err.message, stack: err.stack };
  };

  const result = indexResult.researchObjects[0];
  if (!result) {
    return { error: shouldExist, result: null };
  };

  return { error: false, nVersions: result.versions.length , result };
};

const debugDb = async (
  _node: NodeDbClosure
) => {

  return { error: false, result: "skipped" };
};
