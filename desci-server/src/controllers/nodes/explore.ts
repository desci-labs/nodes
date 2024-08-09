import { Request, Response } from 'express';
import { prisma } from '../../client.js';
import { logger as parentLogger } from '../../logger.js';
import { _getDpidForTxIds, _getIndexedResearchObjects, getIndexedResearchObjects } from '../../theGraph.js';
import { decodeBase64UrlSafeToHex, hexToCid } from '../../utils.js';

const logger = parentLogger.child({
  module: 'NODE::exploreController',
});

/**
 * Traverse all published nodes. This should ideally be done by the resolver,
 * but while we need to union over legacy and new dPID registries it's much
 * easier to use the DB state to figure out where to look for histories.
 *
 * Tradeoffs:
 * - Using the nodes DB to find nodes
 * - If no dpidAlias, falling back to querying the dpid SG by tx id
 * - Have to be backward compatible with the old resolver format
 * - Order of node selection depends on node.updatedAt instead of the actual pub
 * - Unecessarily digs through historical versions in the index
*/
export const explore = async (req: Request, res: Response) => {
  const page: number = req.query.page ? parseInt(req.query.page as string) : 1;
  const size: number = req.query.size ? parseInt(req.query.size as string) : 10;

  logger.info({ page, size });
  if (size > 10) {
    logger.warn({ size }, "explore queries get progressively slower for large sets, under 10 is best");
  }

  let nodes = await prisma.node.findMany({
    select: {
      uuid: true,
      dpidAlias: true,
      updatedAt: true,
      versions: {
        select: {
          transactionId: true,
          commitId: true,
        },
        where: {
          OR: [
            { transactionId: { not: null }},
            { commitId: { not: null }},
          ],
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    where: {
      versions: {
        // true if there were any versions with publish event IDs
        some: {
          OR: [
            { transactionId: { not: null }},
            { commitId: { not: null }},
          ],
        },
      },
    },
    orderBy: {
      updatedAt: "desc",
      // Ideal: sort on publish date, smt like this:
      // versions: { createdAt: "desc" }
    },
    take: size,
    skip: (page - 1) * size,
  });

  /* nodes-web (current) requirements:
  - uses id only as item keys, can be anything unique
  - needs dpid field, used onClick to resolve node
  - needs recentCid for: title, authors
  - uses date from versions[-1].time
  - title from manifest

  Could probably figure this stuff out from the database state though
  to make this mess simpler and faster, if that works for the webapp.

  TODO: The time it takes to get the entire history for each stream increases
  with the number of objects being checked, as we only use the timestamp
  this is unnecessary.
  */
  try {
    const indexedObjectsPromise = getIndexedResearchObjects(
      nodes.map(n => n.uuid)
    );

    const legacyDpidsPromise = _getDpidForTxIds(nodes
      .map(n => n.versions[0].transactionId)
      .filter(Boolean)
    );

    const [indexedObjects, legacyDpids] = await Promise.all(
      [indexedObjectsPromise, legacyDpidsPromise]
    );

    if (indexedObjects.researchObjects.length !== nodes.length) {
      logger.warn({ indexedObjects, nodes }, "Indexers and database ")
    };

    const txToLegacyDpid = legacyDpids.reduce(
      (acc, ld) => ({ ...acc, [ld.transactionHash]: parseInt(ld.entryId) }),
      ({} as Record<string, string>),
    );

    const withDpid = indexedObjects.researchObjects
      .toSorted((o1, o2) => parseInt(o1.versions[0].time) - parseInt(o2.versions[0].time))
      .map(indexObject => {
        const node = nodes.find(
          n => `0x${decodeBase64UrlSafeToHex(n.uuid)}` === indexObject.id
        );
        return {
          id: indexObject.id,
          dpid: node.dpidAlias ?? txToLegacyDpid[node.versions[0].transactionId] ?? null,
          recentCid: hexToCid(indexObject.recentCid),
          researchObject: {
            ...indexObject,
            versions: indexObject.versions.map(v => ({
              ...v,
              cid: hexToCid(v.cid),
              time: parseInt(v.time),
            }))
          }
        }
      });
    return res.send(withDpid);
  } catch (e) {
    logger.error({ e, nodes }, "explore query failed to complete");
    return res.status(500).send();
  }
};
