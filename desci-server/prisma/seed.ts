import { prisma } from '../src/client.js';
import communitiesData from '../src/data/communities.json' assert { type: 'json' };
import researchFieldsData from '../src/data/fields.json' assert { type: 'json' };
import { asyncMap, attestationService, communityService } from '../src/internal.js';
import { seedSocialData } from '../src/scripts/seed-social-data.ts';
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
  if (process.env.NODE_ENV === 'test') return;

  await seedSocialData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    console.log('PRISMA DISCONNECT START');
    await prisma.$disconnect();
    console.log('PRISMA DISCONNECT END');
    process.exit(0);
  });
