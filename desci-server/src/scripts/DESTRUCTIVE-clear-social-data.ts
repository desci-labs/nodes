import { prisma } from '../client.js';

export const clearSocialData = async () => {
  await prisma.nodeFeedItemEndorsement.deleteMany({
    where: {
      desciCommunityId: { not: undefined },
    },
  });
  await prisma.communityEntryAttestation.deleteMany({});
  await prisma.annotation.deleteMany({});
  await prisma.nodeAttestationReaction.deleteMany({});
  await prisma.nodeAttestationVerification.deleteMany({});
  await prisma.nodeAttestation.deleteMany({});
  await prisma.attestationVersion.deleteMany({});
  await prisma.attestation.deleteMany({});
  await prisma.desciCommunity.deleteMany({});
  await prisma.attestationTemplate.deleteMany({});
};

if (process.env.ENABLE_SOCIAL_DATA_SEED_SCRIPTS) {
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
  console.log('Must set ENABLE_SOCIAL_DATA_SEED_SCRIPTS=1 to activate clearing of social data, skipping...');
  process.exit(0);
}
