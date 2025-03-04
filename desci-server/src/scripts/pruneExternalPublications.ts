import { prisma } from '../client.js';

const main = async () => {
  const rows = await prisma.externalPublications.deleteMany({
    // where: { verifiedAt: null },
  });

  return rows;
};

main()
  .then((result) => console.log('ExternalPublications Pruned', result))
  .catch((err) => console.log('Error running script ', err));
