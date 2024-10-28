import { prisma } from '../client.js';

const main = async () => {
  const annotations = await prisma.annotation.findMany({
    where: { uuid: null },
    include: { attestation: { select: { nodeUuid: true } } },
  });
  const fields = await prisma.$transaction(
    annotations.map(({ id, ...annotation }) =>
      prisma.annotation.upsert({
        where: { id },
        create: {
          authorId: annotation.authorId,
          body: annotation.body,
          type: annotation.type,
          nodeAttestationId: annotation.nodeAttestationId,
          links: annotation.links,
          visible: annotation.visible,
          highlights: annotation.highlights,
          uuid: annotation.uuid || annotation.attestation?.nodeUuid,
        },
        update: { uuid: annotation.attestation?.nodeUuid },
      }),
    ),
  );
  console.log('Annotations fields updated', fields);
};

main()
  .then((result) => console.log('Annotations backfilled', result))
  .catch((err) => console.log('Error running script ', err));
