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

  const attestationInstances = await asyncMap(communitiesData['attestations'], async (attestation) => {
    const communityFromDb = await prisma.desciCommunity.findFirst({ where: { name: attestation.communityName } });
    if (!communityFromDb) throw Error(`${attestation.communityName} not found in Database`);

    const [attestationInstance] = await prisma.$transaction([
      prisma.attestation.upsert({
        where: {
          // name: attestation.name,
          name_communityId: { name: attestation.name, communityId: communityFromDb.id },
        },
        create: {
          communityId: communityFromDb.id,
          name: attestation.name,
          description: attestation.description,
          image_url: attestation.image_url,
          // templateId: attestation.id,
        },
        update: {
          communityId: communityFromDb.id,
          name: attestation.name,
          description: attestation.description,
          image_url: attestation.image_url,
          // templateId: attestation.id,
        },
      }),
    ]);

    console.log(
      '--- attestationInstance',
      attestation.name,
      '-->',
      attestationInstance.name,
      attestationInstance.id,
      attestationInstance.communityId,
    );

    let attestationVersion = await prisma.attestationVersion.findFirst({
      where: { attestationId: attestationInstance.id },
    });

    console.log('---  check attestationVersion', attestationVersion?.id, attestationVersion?.attestationId);

    // console.log(
    //   `CHECK ATTESTATION VERSION FOR ${attestationInstance.id} = ${attestationVersion.id}-${attestationVersion.attestationId}`,
    // );
    if (!attestationVersion) {
      console.log('--- create attestationVersion for', attestationInstance.name, attestationInstance.id);

      [attestationVersion] = await prisma.$transaction([
        prisma.attestationVersion.create({
          data: {
            name: attestationInstance.name,
            description: attestationInstance.description,
            image_url: attestationInstance.image_url,
            attestationId: attestationInstance.id,
          },
        }),
      ]);

      console.log(
        '--- created attestationVersion for',
        attestationInstance.name,
        attestationInstance.id,
        ' version:',
        attestationVersion.id,
        attestationVersion.attestationId,
      );
    } else {
      // UPDATE details of the version
      [attestationVersion] = await prisma.$transaction([
        prisma.attestationVersion.upsert({
          where: { id: attestationVersion.id },
          create: {
            name: attestationInstance.name,
            description: attestationInstance.description,
            image_url: attestationInstance.image_url,
            attestationId: attestationInstance.id,
          },
          update: {
            name: attestationInstance.name,
            description: attestationInstance.description,
            image_url: attestationInstance.image_url,
            attestationId: attestationInstance.id,
          },
        }),
      ]);

      console.log(
        '--- updated attestationVersion for',
        attestationInstance.name,
        attestationInstance.id,
        ' version:',
        attestationVersion.id,
        attestationVersion.attestationId,
      );
    }

    return { attestation: attestationInstance, attestationVersion: attestationVersion };
  });

  // create attestations and attestationVersions and CommunityEntryAttestations
  // const attestations = await asyncMap(communitiesData['communities'], async (community) => {
  // check
  for (const community of communitiesData['communities']) {
    console.log('SEEDING DATA FOR COMMUNITY', community.name);

    const communityFromDb = await prisma.desciCommunity.findFirst({ where: { name: community.name } });
    if (!communityFromDb) throw Error(`${community.name} not found in Database`);

    for (const requiredAttestation of community.requiredAttestations) {
      console.log('RUN SEED FOR ', requiredAttestation);
      const { attestation: attestationInstance, attestationVersion } = attestationInstances.find(
        (entry) => entry.attestation.name === requiredAttestation,
      );
      // const template = attestationTemplates.find((template) => template.name === requiredAttestation);
      if (!attestationInstance || !attestationVersion) throw Error(`No attestation found for ${requiredAttestation}`);

      let selected = await prisma.communityEntryAttestation.findUnique({
        where: {
          attestationId_attestationVersionId_desciCommunityId: {
            attestationId: attestationInstance.id,
            attestationVersionId: attestationVersion.id,
            desciCommunityId: communityFromDb.id,
          },
        },
      });
      console.log('---  check communityEntryAttestation', selected?.id, selected?.attestationId);

      if (!selected) {
        console.log(
          '--- Create communityEntryAttestation',
          communityFromDb.name,
          attestationInstance.name,
          attestationInstance.id,
          attestationVersion.id,
        );

        [selected] = await prisma.$transaction([
          prisma.communityEntryAttestation.create({
            data: {
              desciCommunityId: communityFromDb.id,
              attestationId: attestationInstance.id,
              attestationVersionId: attestationVersion.id,
              required: true,
            },
          }),
        ]);
        console.log(
          '--- Added communityEntryAttestation',
          selected?.id,
          selected?.attestationId,
          selected.desciCommunityId,
        );
      } else {
        console.log(
          `Community ${communityFromDb.name} already has selected Attestation: ${selected.desciCommunityId}-${selected.attestationId}-${selected.attestationVersionId}`,
        );
      }
      console.log(`seed for ${communityFromDb.name}:${attestationInstance.name}\n`, {
        attestationInstance,
        attestationVersion,
        selected,
      });
    }
    const communityAttestations = await prisma.attestation.findMany({
      where: { communityId: communityFromDb.id },
      include: { CommunityEntryAttestation: true },
    });
    console.log(`FINALIZED SEEDING FOR ${communityFromDb.name}`, { communityAttestations });
  }

  return 'done';
};

if (process.env.RUN) {
  seedSocialData()
    .then(() => console.log('Communities and Attestations created/updated'))
    .catch((err) => console.log('Error running script ', err));
} else {
  console.log('Must set RUN=1 to activate seeding of social data, skipping...');
  process.exit(0);
}
