import { prisma } from '../client.js';
import { logger } from '../logger.js';
import { communityService } from '../services/Communities.js';

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
    const entryAttestations = await communityService.getEntryAttestations({
      desciCommunityId: nodeAttestation.desciCommunityId,
    });

    const claimedAttestations = await prisma.nodeAttestation.findMany({
      where: { desciCommunityId: nodeAttestation.desciCommunityId, nodeUuid: nodeAttestation.nodeUuid },
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

    await prisma.communityRadarEntry.create({
      data: {
        desciCommunityId: nodeAttestation.desciCommunityId,
        nodeUuid: nodeAttestation.nodeUuid,
      },
    });
    radarCount++;
  }
  logger.info({ radarCount }, 'Community radar fields: ');
  return radarCount;
};

main()
  .then((result) => console.log('Community backfilled', result))
  .catch((err) => console.log('Error running script ', err));
