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
    const community = communities.find((c) => c.name === attestation.communityName);
    if (!community) throw new Error(`${attestation.communityName} not found, check seed data and retry`);
    const inserted = await prisma.attestation.upsert({
      where: {
        name: attestation.name,
      },
      create: {
        communityId: community?.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
      update: {
        communityId: community?.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
    });
    let version = await prisma.attestationVersion.findFirst({ where: { attestationId: inserted.id } });
    if (!version) {
      console.log('Publish version for', attestation.communityName, ' =>', attestation.name);
      version = await prisma.attestationVersion.create({
        data: {
          name: attestation.name,
          description: attestation.description,
          image_url: attestation.image_url,
          attestationId: inserted.id,
        },
      });
    }

    // loop through all communities that have this attestation and add it to their selected attestations
    for (let i = 0; i < communitiesData['communities'].length; i++) {
      const community = communitiesData['communities'][i];
      const communityFromDb = await prisma.desciCommunity.findFirst({ where: { name: community.name } });
      if (community.requiredAttestations.includes(attestation.name)) {
        console.log(`Checking community ${community.name} for attestation ${attestation.name}...`);
        const selected = await prisma.communitySelectedAttestation.findFirst({
          where: {
            attestationId: inserted.id,
            attestationVersionId: version.id,
          },
        });
        if (!selected) {
          console.log(`Adding to community ${communityFromDb.name}, Attestation: ${attestation.name}`);
          await prisma.communitySelectedAttestation.create({
            data: {
              desciCommunityId: communityFromDb.id,
              attestationId: inserted.id,
              attestationVersionId: version.id,
              required: true,
            },
          });
        } else {
          console.log(`Community ${communityFromDb.name} already had Attestation: ${attestation.name}`);
        }
      }
    }
    return { ...inserted, versions: version };
  });

  // console.log('Attestations SEEDED', inserted);
  return inserted;
};

if (process.env.RUN) {
  seedSocialData()
    .then((result) => console.log('Communities and Attestations created/updated'))
    .catch((err) => console.log('Error running script ', err));
} else {
  console.log('Must set RUN=1');
  process.exit(0);
}
