import { prisma } from '../client.js';
import communitiesData from '../data/communities.json' assert { type: 'json' };
import { asyncMap } from '../utils.js';

export const seedSocialData = async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // const researchFieldsData = require('../../data/fields.json');
  // const parsedFields: { name: string }[] = researchFieldsData.map((name) => ({ name }));

  // const communities = await prisma.desciCommunity.createMany({
  //   data: communitiesData['communities'],
  //   skipDuplicates: true,
  // });
  const communities = await Promise.all(
    communitiesData['communities'].map((community) =>
      prisma.desciCommunity.upsert({
        where: { slug: community.slug },
        create: {
          name: community.name,
          hidden: community.hidden,
          memberString: community.members,
          links: community.links,
          subtitle: community.subtitle,
          description: community.description,
          image_url: community.image_url,
          keywords: community.keywords,
          slug: community.slug,
        },
        update: {
          description: community.description,
          hidden: community.hidden,
          memberString: community.members,
          links: community.links,
          subtitle: community.subtitle,
          image_url: community.image_url,
          keywords: community.keywords,
          slug: community.slug,
        },
      }),
    ),
  );

  // console.log('Communities SEEDED', communities);
  const inserted = await asyncMap(communitiesData['attestations'], async (attestation) => {
    const attestationTemplateAuthorCommunity = communities.find((c) => c.name === attestation.communityName);
    if (!attestationTemplateAuthorCommunity)
      throw new Error(`${attestation.communityName} not found, check seed data and retry`);
    const attestationTemplate = await prisma.attestationTemplate.upsert({
      where: {
        name: attestation.name,
      },
      create: {
        desciCommunityId: attestationTemplateAuthorCommunity?.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
      update: {
        desciCommunityId: attestationTemplateAuthorCommunity?.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
    });

    // loop through all communities that have this attestation and add it to their selected attestations
    for (let i = 0; i < communitiesData['communities'].length; i++) {
      const community = communitiesData['communities'][i];
      const communityFromDb = await prisma.desciCommunity.findFirst({ where: { name: community.name } });
      if (community.requiredAttestations.includes(attestationTemplate.name)) {
        console.log(`Checking community ${community.name} for attestation ${attestationTemplate.name}...`);

        const attestationInstance = await prisma.attestation.upsert({
          where: {
            name: attestation.name,
          },
          create: {
            communityId: communityFromDb?.id,
            name: attestation.name,
            description: attestation.description,
            image_url: attestation.image_url,
            templateId: attestationTemplate.id,
          },
          update: {
            communityId: communityFromDb?.id,
            name: attestation.name,
            description: attestation.description,
            image_url: attestation.image_url,
            templateId: attestationTemplate.id,
          },
        });
        let version = await prisma.attestationVersion.findFirst({ where: { attestationId: attestationInstance.id } });
        if (!version) {
          console.log('Publish version for', attestation.communityName, ' =>', attestation.name);
          version = await prisma.attestationVersion.create({
            data: {
              name: attestation.name,
              description: attestation.description,
              image_url: attestation.image_url,
              attestationId: attestationInstance.id,
            },
          });
        }

        const selected = await prisma.communitySelectedAttestation.findFirst({
          where: {
            attestationId: attestationInstance.id,
            attestationVersionId: version.id,
            desciCommunityId: communityFromDb.id,
          },
        });
        if (!selected) {
          console.log(`Adding to community ${communityFromDb.name}, Attestation: ${attestation.name}`);
          await prisma.communitySelectedAttestation.create({
            data: {
              desciCommunityId: communityFromDb.id,
              attestationId: attestationInstance.id,
              attestationVersionId: version.id,
              required: true,
            },
          });
        } else {
          console.log(`Community ${communityFromDb.name} already had Attestation: ${attestation.name}`);
        }
      }
    }
    return { ok: true };
  });

  // console.log('Attestations SEEDED', inserted);
  return inserted;
};

if (process.env.RUN) {
  seedSocialData()
    .then(() => console.log('Communities and Attestations created/updated'))
    .catch((err) => console.log('Error running script ', err));
} else {
  console.log('Must set RUN=1');
  process.exit(0);
}
