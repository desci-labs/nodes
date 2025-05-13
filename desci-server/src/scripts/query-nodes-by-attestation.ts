import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listAttestations() {
  const attestations = await prisma.attestation.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });
  console.log('Available Attestations:');
  for (const att of attestations) {
    console.log(`ID: ${att.id} | Name: ${att.name}`);
  }
}

async function listNodesByAttestation(attestationIds: number[]) {
  const nodes = await prisma.node.findMany({
    where: {
      NodeAttestation: {
        some: {
          attestationId: {
            in: attestationIds,
          },
          NodeAttestationVerification: {
            some: {}, // This ensures there is at least one verification
          },
        },
      },
    },
    select: {
      id: true,
      title: true,
      uuid: true,
      dpidAlias: true,
      ceramicStream: true,
    },
    orderBy: {
      id: 'asc',
    },
  });

  // Print table header
  console.log('\nNode Details (Verified Attestations Only):');
  console.log('ID\tTitle\tUUID\tDPID\tCeramic Stream');
  console.log('--\t-----\t----\t---\t--------------');

  // Print each node
  for (const node of nodes) {
    console.log(`${node.id}\t${node.title}\t${node.uuid}\t${node.dpidAlias || 'N/A'}\t${node.ceramicStream || 'N/A'}`);
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!command || (command !== 'attestations' && command !== 'nodes')) {
    console.error('Usage:');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts attestations');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts nodes <attestationId>[,attestationId2,...]');
    process.exit(1);
  }

  try {
    if (command === 'attestations') {
      await listAttestations();
    } else if (command === 'nodes') {
      if (!arg) {
        console.error('Error: attestationId(s) required for the nodes command.');
        process.exit(1);
      }

      const attestationIds = arg
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));

      if (attestationIds.length === 0) {
        console.error('Error: No valid attestation IDs provided.');
        process.exit(1);
      }

      await listNodesByAttestation(attestationIds);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
