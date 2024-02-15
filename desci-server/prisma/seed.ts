import communitiesData from '../data/communities.json' assert { type: 'json' };
import researchFieldsData from '../data/fields.json' assert { type: 'json' };
import { prisma } from '../src/client.js';
import { asyncMap, attestationService, communityService } from '../src/internal.js';

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

  console.log('Communities SEEDED', communities);
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
        where: { desciCommunityId: inserted.communityId, attestationId: inserted.id, attestationVersionId: version.id },
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

  console.log('Attestations SEEDED', inserted);
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
