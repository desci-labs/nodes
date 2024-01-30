import { PublicDataReferenceOnIpfsMirror } from '@prisma/client';

import { prisma } from '../client.js';
import { logger } from '../logger.js';

async function main() {
  const publicDataReferences = await prisma.publicDataReference.findMany({
    where: {
      mirrors: { none: { dataReferenceId: { gt: 0 } } },
    },
    include: { mirrors: true },
  });

  const activeMirrors = (await prisma.ipfsMirror.findMany()).map((mirror) => mirror.id);
  const dataOnMirrorReferences: PublicDataReferenceOnIpfsMirror[] = [];

  for (const dataReference of publicDataReferences) {
    for (const mirror of activeMirrors) {
      dataOnMirrorReferences.push({
        dataReferenceId: dataReference.id,
        mirrorId: mirror,
        status: 'WAITING',
        retryCount: 0,
        providerCount: 0,
      });
    }
  }

  const mirrors = await prisma.publicDataReferenceOnIpfsMirror.createMany({
    data: dataOnMirrorReferences,
    skipDuplicates: true,
  });
  logger.info({ mirrors: mirrors.count }, 'Mirrors');
  logger.info(
    { dataOnMirrorReferences: dataOnMirrorReferences.length, publicDataReferences: publicDataReferences.length },
    'Refs',
    dataOnMirrorReferences.length,
    publicDataReferences.length,
  );
  return mirrors;
}

main()
  .then((result) => logger.info({ result }, 'Mirrors fixed', result))
  .catch((err) => logger.info({ err }, 'Error running script ', err));
