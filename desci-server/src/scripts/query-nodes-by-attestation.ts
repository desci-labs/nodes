import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Utility function for table formatting
function formatTable(rows: string[][], headers: string[]) {
  // Calculate column widths
  const colWidths = headers.map((_, i) => Math.max(headers[i].length, ...rows.map((row) => (row[i] || '').length)));

  // Print headers
  console.log('\n' + headers.map((h, i) => h.padEnd(colWidths[i])).join('  '));
  console.log(headers.map((h, i) => '-'.repeat(colWidths[i])).join('  '));

  // Print rows
  rows.forEach((row) => {
    console.log(row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  '));
  });
}

async function listAttestations() {
  const attestations = await prisma.attestation.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const rows = attestations.map((att) => [att.id.toString(), att.name]);

  formatTable(rows, ['ID', 'Name']);
}

async function listCommunities() {
  const communities = await prisma.desciCommunity.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          CommunitySubmission: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  const rows = communities.map((community) => [
    community.id.toString(),
    community.name,
    community._count.CommunitySubmission.toString(),
  ]);

  formatTable(rows, ['ID', 'Name', 'Submission Count']);
}

async function auditCommunity(communityId: number, attestationIds: number[]) {
  // Get community details
  const community = await prisma.desciCommunity.findUnique({
    where: { id: communityId },
    select: { id: true, name: true },
  });

  if (!community) {
    console.error(`Error: Community with ID ${communityId} not found.`);
    process.exit(1);
  }

  // Get attestation details
  const attestations = await prisma.attestation.findMany({
    where: { id: { in: attestationIds } },
    select: { id: true, name: true },
  });

  if (attestations.length !== attestationIds.length) {
    const foundIds = attestations.map((a) => a.id);
    const missingIds = attestationIds.filter((id) => !foundIds.includes(id));
    console.error(`Error: Some attestations not found: ${missingIds.join(', ')}`);
    process.exit(1);
  }

  console.log('\nAudit Configuration:');
  console.log('-------------------');
  console.log(`Community: ${community.name} (ID: ${community.id})`);
  console.log('\nRequired Attestations:');
  attestations.forEach((att) => {
    console.log(`- ${att.name} (ID: ${att.id})`);
  });
  console.log('\n');

  // Get all community submissions
  const submissions = await prisma.communitySubmission.findMany({
    where: {
      communityId: communityId,
    },
    include: {
      node: {
        select: {
          id: true,
          title: true,
          uuid: true,
          dpidAlias: true,
          NodeAttestation: {
            where: {
              attestationId: {
                in: attestationIds,
              },
              NodeAttestationVerification: {
                some: {},
              },
            },
            select: {
              attestationId: true,
              attestation: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  console.log(`Found ${submissions.length} submissions in community.\n`);

  // Analyze results
  const issues: string[] = [];
  const rows: string[][] = [];

  for (const submission of submissions) {
    const node = submission.node;
    const receivedAttestationIds = node.NodeAttestation.map((na) => na.attestationId);
    const missingAttestations = attestationIds.filter((id) => !receivedAttestationIds.includes(id));

    const nodeIssues: string[] = [];

    // Check for missing attestations
    if (missingAttestations.length > 0) {
      const missingAttestationNames = attestations
        .filter((att) => missingAttestations.includes(att.id))
        .map((att) => `${att.name} (ID: ${att.id})`);
      nodeIssues.push(`Missing attestations: ${missingAttestationNames.join(', ')}`);
    }

    // Check for missing UUID or DPID
    if (!node.uuid) {
      nodeIssues.push('Missing UUID');
    }
    if (!node.dpidAlias) {
      nodeIssues.push('Missing DPID');
    }

    if (nodeIssues.length > 0) {
      rows.push([node.id.toString(), node.title, nodeIssues.join('; ')]);
    }
  }

  // Print results
  console.log(`Audit Results for ${community.name}:`);
  if (rows.length === 0) {
    console.log('✓ All nodes have required attestations and valid UUID/DPID.');
  } else {
    console.log(`Found ${rows.length} nodes with issues:`);
    formatTable(rows, ['Node ID', 'Title', 'Issues']);
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

  const rows = nodes.map((node) => [
    node.id.toString(),
    node.title,
    node.uuid || 'N/A',
    node.dpidAlias?.toString() || 'N/A',
    node.ceramicStream || 'N/A',
  ]);

  formatTable(rows, ['ID', 'Title', 'UUID', 'DPID', 'Ceramic Stream']);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (
    !command ||
    (command !== 'attestations' && command !== 'nodes' && command !== 'communities' && command !== 'audit')
  ) {
    console.error('Usage:');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts attestations');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts nodes <attestationId>[,attestationId2,...]');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts communities');
    console.error(
      '  ts-node src/scripts/query-nodes-by-attestation.ts audit <communityId> <attestationId>[,attestationId2,...]',
    );
    process.exit(1);
  }

  try {
    if (command === 'attestations') {
      await listAttestations();
    } else if (command === 'communities') {
      await listCommunities();
    } else if (command === 'audit') {
      if (args.length < 2) {
        console.error('Error: Both communityId and attestationId(s) are required.');
        console.error(
          'Usage: ts-node src/scripts/query-nodes-by-attestation.ts audit <communityId> <attestationId>[,attestationId2,...]',
        );
        process.exit(1);
      }

      const communityId = parseInt(args[0], 10);
      const attestationIdsStr = args[1];
      const attestationIds = attestationIdsStr
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));

      if (isNaN(communityId) || attestationIds.length === 0) {
        console.error('Error: Invalid communityId or attestationId(s).');
        console.error(
          'Usage: ts-node src/scripts/query-nodes-by-attestation.ts audit <communityId> <attestationId>[,attestationId2,...]',
        );
        process.exit(1);
      }

      await auditCommunity(communityId, attestationIds);
    } else if (command === 'nodes') {
      if (!args[0]) {
        console.error('Error: attestationId(s) required for the nodes command.');
        process.exit(1);
      }

      const attestationIds = args[0]
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
