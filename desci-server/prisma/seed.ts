import communitiesData from '../data/communities.json' assert { type: 'json' };
import researchFieldsData from '../data/fields.json' assert { type: 'json' };
import { prisma } from '../src/client.js';
import { attestationService, communityService } from '../src/internal.js';

async function main() {
  await prisma.user.upsert({
    where: {
      email: 'noreply@desci.com',
    },
    update: {},
    create: {
      email: 'noreply@desci.com',
      phoneNumber: '123',

      isPatron: false,
      isWarden: false,
      isKeeper: false,
    },
  });

  const estuary = await prisma.ipfsMirror.upsert({
    // select: { id: true, name: true },
    where: {
      name: 'estuary',
    },
    update: {},
    create: {
      name: 'estuary',
      description: 'estuary ipfs storage provider',
      website: 'https://estuary.tech/',
    },
  });
  console.log('estuary mirror', estuary);
  const foundByName = await prisma.ipfsMirror.findFirst({
    where: {
      name: 'estuary',
    },
  });
  console.log('estuary foundByName', foundByName);

  const parsedFields: { name: string }[] = researchFieldsData.map((name) => ({ name }));

  const fields = await prisma.researchFields.createMany({ data: parsedFields, skipDuplicates: true });
  console.log('Research fields inserted', fields.count);

  // const metascienceVault = await prisma.vault.upsert({
  //   where: {
  //     name: 'Metascience',
  //   },
  //   update: {},
  //   create: {
  //     name: 'Metascience',
  //     image: 'https://www.dropbox.com/s/fw6bqy684pwekxi/desci-tree-opt.jpg?dl=1',
  //     description: 'Metascience ARC',
  //   },
  // });
  // const genomicsVault = await prisma.vault.upsert({
  //   where: {
  //     name: 'Genomics',
  //   },
  //   update: {},
  //   create: {
  //     name: 'Genomics',
  //     image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRvnnIpKzvYW1VnE0LXdfU7qunIc2TwojpLDw&usqp=CAU',
  //     description: 'Computational Genomics ARC',
  //   },
  // });

  // console.log({ metascienceVault, genomicsVault, owner });
  console.log('NODE ENV', process.env.NODE_ENV);

  const communities = await Promise.all(
    communitiesData['communities'].map((community) =>
      prisma.desciCommunity.upsert({
        where: { name: community.name },
        create: {
          name: community.name,
          description: community.description,
          image_url: community.image_url,
          keywords: community.keywords,
        },
        update: {
          description: community.description,
          image_url: community.image_url,
          keywords: community.keywords,
        },
      }),
    ),
  );

  console.log('Communities SEEDED', communities);
  const attestations = await Promise.all(
    communitiesData['attestations'].map((attestation) => {
      const community = communities.find((c) => c.name === attestation.communityName);
      if (!community) return null;
      return prisma.attestation.upsert({
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
    }),
  );
  console.log('Attestations SEEDED', attestations);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
