import { prisma } from '../client.js';
import { logger } from '../logger.js';
// import { communityService } from '../services/Communities.js';

const main = async () => {
  const nodeAttestations = await prisma.nodeAttestation.findMany({ where: { revoked: false } });
  let radarCount = 0;
  for (const nodeAttestation of nodeAttestations) {
    const exists = await prisma.communityRadarEntry.findFirst({
      where: { nodeUuid: nodeAttestation.nodeUuid, desciCommunityId: nodeAttestation.desciCommunityId },
    });
    if (exists) {
      logger.trace(
        {
          node: nodeAttestation.nodeDpid10,
          communityId: nodeAttestation.desciCommunityId,
        },
        'Radar exists',
      );
      continue;
    }

    // check if node has claimed all community entry attestations
    const entryAttestations = await prisma.communityEntryAttestation.findMany({
      orderBy: { createdAt: 'asc' },
      where: { desciCommunityId: nodeAttestation.desciCommunityId },
      include: {
        attestation: { select: { protected: true, community: { select: { name: true } } } },
        // desciCommunity: { select: { name: true } },
        attestationVersion: {
          select: { id: true, attestationId: true, name: true, image_url: true, description: true },
        },
      },
    });

    const claimedAttestations = await prisma.nodeAttestation.findMany({
      where: { desciCommunityId: nodeAttestation.desciCommunityId, nodeUuid: nodeAttestation.nodeUuid, revoked: false },
    });

    const isEntriesClaimed = entryAttestations.every((entry) =>
      claimedAttestations.find(
        (claimed) =>
          claimed.attestationId === entry.attestationId && claimed.attestationVersionId === entry.attestationVersionId,
      ),
    );
    if (!isEntriesClaimed) {
      logger.info(
        {
          node: nodeAttestation.nodeDpid10,
          claims: claimedAttestations.length,
          entryAttestations: entryAttestations.length,
          communityId: nodeAttestation.desciCommunityId,
        },
        'Not Qualified for Radar',
      );
      continue;
    }
    // End check if node has claimed all community entry attestations

    const radarEntry = await prisma.communityRadarEntry.create({
      data: {
        desciCommunityId: nodeAttestation.desciCommunityId,
        nodeUuid: nodeAttestation.nodeUuid,
      },
    });
    radarCount++;

    const claims = await prisma.$transaction(
      claimedAttestations.map((claim) =>
        prisma.nodeAttestation.update({ where: { id: claim.id }, data: { communityRadarEntryId: radarEntry.id } }),
      ),
    );
    logger.info({ rows: claims.length }, 'Claims Updated');
  }
  logger.info({ radarCount }, 'Community radar fields: ');
  return radarCount;
};

main()
  .then((result) => console.log('Community backfilled', result))
  .catch((err) => console.log('Error running script ', err));
