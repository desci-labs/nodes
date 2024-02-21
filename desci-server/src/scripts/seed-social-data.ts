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

  // create templates
  const attestationTemplates = await asyncMap(communitiesData['attestations'], async (attestation) => {
    const attestationTemplateAuthorCommunity = communities.find((c) => c.name === attestation.communityName);
    if (!attestationTemplateAuthorCommunity)
      throw new Error(`${attestation.communityName} not found, check seed data and retry`);
    console.log('UPSERT TEMPLATE', attestation.name, ' community', attestationTemplateAuthorCommunity.name);
    const template = await prisma.attestationTemplate.upsert({
      where: { name: attestation.name },
      create: {
        desciCommunityId: attestationTemplateAuthorCommunity.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
      update: {
        desciCommunityId: attestationTemplateAuthorCommunity.id,
        name: attestation.name,
        description: attestation.description,
        image_url: attestation.image_url,
      },
    });
    return template;
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

      const template = attestationTemplates.find((template) => template.name === requiredAttestation);
      if (!template) throw Error(`No template found for ${requiredAttestation}`);

      const [attestationInstance] = await prisma.$transaction([
        prisma.attestation.upsert({
          where: {
            // name: attestation.name,
            name_communityId: { name: template.name, communityId: communityFromDb.id },
          },
          create: {
            communityId: communityFromDb.id,
            name: template.name,
            description: template.description,
            image_url: template.image_url,
            templateId: template.id,
          },
          update: {
            communityId: communityFromDb.id,
            name: template.name,
            description: template.description,
            image_url: template.image_url,
            templateId: template.id,
          },
        }),
      ]);

      console.log('--- attestationInstance', attestationInstance.id, attestationInstance.communityId);

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
          prisma.attestationVersion.upsert({
            where: {},
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
          '--- created attestationVersion for',
          attestationInstance.name,
          attestationInstance.id,
          ' version:',
          attestationVersion.id,
          attestationVersion.attestationId,
        );
      }

      let selected = await prisma.communityEntryAttestation.findUnique({
        where: {
          attestationId_attestationVersionId_desciCommunityId: {
            attestationId: attestationInstance.id,
            attestationVersionId: attestationVersion.id,
            desciCommunityId: communityFromDb.id,
          },
        },
      });
      console.log(
        '---  check communityEntryAttestation',
        selected?.id,
        selected?.attestationId,
        selected.desciCommunityId,
      );

      if (!selected) {
        console.log(
          '--- Create communityEntryAttestation',
          communityFromDb.name,
          attestationInstance.name,
          attestationInstance.id,
          attestationVersion.id,
        );
        // console.log(`Adding to community ${communityFromDb.name}, Attestation: ${attestationInstance.name}`);
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
    // });
  }

  // const inserted = await asyncMap(communitiesData['attestations'], async (attestation) => {
  //   const attestationTemplateAuthorCommunity = communities.find((c) => c.name === attestation.communityName);
  //   if (!attestationTemplateAuthorCommunity)
  //     throw new Error(`${attestation.communityName} not found, check seed data and retry`);
  //   const attestationTemplate = await prisma.attestationTemplate.upsert({
  //     where: {
  //       name: attestation.name,
  //     },
  //     create: {
  //       desciCommunityId: attestationTemplateAuthorCommunity?.id,
  //       name: attestation.name,
  //       description: attestation.description,
  //       image_url: attestation.image_url,
  //     },
  //     update: {
  //       desciCommunityId: attestationTemplateAuthorCommunity?.id,
  //       name: attestation.name,
  //       description: attestation.description,
  //       image_url: attestation.image_url,
  //     },
  //   });

  //   // loop through all communities that have this attestation and add it to their selected attestations
  //   for (let i = 0; i < communitiesData['communities'].length; i++) {
  //     const community = communitiesData['communities'][i];
  //     const communityFromDb = await prisma.desciCommunity.findFirst({ where: { name: community.name } });
  //     if (community.requiredAttestations.includes(attestationTemplate.name)) {
  //       console.log(`Checking community ${community.name} for attestation ${attestationTemplate.name}...`);

  //       const [attestationInstance] = await prisma.$transaction([
  //         prisma.attestation.upsert({
  //           where: {
  //             // name: attestation.name,
  //             name_communityId: { name: attestation.name, communityId: communityFromDb.id },
  //           },
  //           create: {
  //             communityId: communityFromDb?.id,
  //             name: attestation.name,
  //             description: attestation.description,
  //             image_url: attestation.image_url,
  //             templateId: attestationTemplate.id,
  //           },
  //           update: {
  //             communityId: communityFromDb?.id,
  //             name: attestation.name,
  //             description: attestation.description,
  //             image_url: attestation.image_url,
  //             templateId: attestationTemplate.id,
  //           },
  //         }),
  //       ]);
  //       let [version] = await prisma.$transaction([
  //         prisma.attestationVersion.findFirst({ where: { attestationId: attestationInstance.id } }),
  //       ]);
  //       if (!version) {
  //         console.log('Publish version for', attestation.communityName, ' =>', attestation.name);
  //         version = await prisma.attestationVersion.create({
  //           data: {
  //             name: attestation.name,
  //             description: attestation.description,
  //             image_url: attestation.image_url,
  //             attestationId: attestationInstance.id,
  //           },
  //         });
  //       }

  //       const selected = await prisma.communityEntryAttestation.findFirst({
  //         where: {
  //           attestationId: attestationInstance.id,
  //           attestationVersionId: version.id,
  //           desciCommunityId: communityFromDb.id,
  //         },
  //       });
  //       if (!selected) {
  //         console.log(`Adding to community ${communityFromDb.name}, Attestation: ${attestation.name}`);
  //         await prisma.communityEntryAttestation.create({
  //           data: {
  //             desciCommunityId: communityFromDb.id,
  //             attestationId: attestationInstance.id,
  //             attestationVersionId: version.id,
  //             required: true,
  //           },
  //         });
  //       } else {
  //         console.log(`Community ${communityFromDb.name} already had Attestation: ${attestation.name}`);
  //       }
  //     }
  //   }
  //   return { ok: true };
  // });

  // console.log('Attestations SEEDED', inserted);
  return 'done';
};

if (process.env.RUN) {
  seedSocialData()
    .then(() => console.log('Communities and Attestations created/updated'))
    .catch((err) => console.log('Error running script ', err));
} else {
  console.log('Must set RUN=1');
  process.exit(0);
}
