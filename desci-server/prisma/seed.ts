import researchFieldsData from '../data/fields.json';
import prisma from '../src/client';

async function main() {
  const owner = await prisma.user.upsert({
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
