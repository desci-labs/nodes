import communitiesData from '../../data/communities.json' assert { type: 'json' };
import { prisma } from '../client.js';
import { asyncMap } from '../utils.js';

const main = async () => {
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
        where: { name: community.name },
        create: {
          name: community.name,
          description: community.description,
          image_url: community.image_url,
          keywords: community.keywords,
          slug: community.slug,
        },
        update: {
          description: community.description,
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

    if (attestation.communitySelected === true) {
      const selected = await prisma.communitySelectedAttestation.findFirst({
        where: {
          desciCommunityId: inserted.communityId,
          attestationId: inserted.id,
          attestationVersionId: version.id,
        },
      });

      if (!selected) {
        console.log(`Add to community entry Attestation`, attestation.name);
        await prisma.communitySelectedAttestation.create({
          data: {
            desciCommunityId: inserted.communityId,
            attestationId: inserted.id,
            attestationVersionId: version.id,
            required: true,
          },
        });
      } else {
        console.log(`FOUND community entry Attestation`, attestation.name);
      }
    }
    return { ...inserted, versions: version, communitySelected: attestation.communitySelected };
  });

  // console.log('Attestations SEEDED', inserted);
  return inserted;
};

main()
  .then((result) => console.log('Communities and Attestations created/updated', result))
  .catch((err) => console.log('Error running script ', err));
