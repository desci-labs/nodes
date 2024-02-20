import { prisma } from '../client.js';

export const clearSocialData = async () => {
  await prisma.nodeFeedItemEndorsement.deleteMany({
    where: {
      desciCommunityId: { not: undefined },
    },
  });
  await prisma.annotation.deleteMany({});
  await prisma.nodeAttestationReaction.deleteMany({});
  await prisma.nodeAttestationVerification.deleteMany({});
  await prisma.communitySelectedAttestation.deleteMany({});
  await prisma.attestationVersion.deleteMany({});
  await prisma.attestation.deleteMany({});
  await prisma.desciCommunity.deleteMany({});
};

if (process.env.RUN) {
  clearSocialData()
    .then(() => {
      console.log('Social data cleared');
      process.exit(0);
    })
    .catch((e) => {
      console.error('Error clearing social data', e);
      process.exit(1);
    });
} else {
  console.log('Must set RUN=1');
  process.exit(0);
}
