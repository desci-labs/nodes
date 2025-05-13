/**
 * Node Attestation Query CLI
 *
 * This CLI tool helps manage and audit nodes with attestations in the DeSci platform.
 * It provides several commands to list and analyze nodes, attestations, and communities.
 *
 * Commands:
 * 1. attestations
 *    Lists all available attestations with their IDs and names
 *    Usage: ts-node src/scripts/query-nodes-by-attestation.ts attestations
 *
 * 2. communities
 *    Lists all DeSci communities with their IDs, names, and submission counts
 *    Usage: ts-node src/scripts/query-nodes-by-attestation.ts communities
 *
 * 3. nodes <attestationIds>
 *    Lists all nodes that have validated attestations matching the provided IDs
 *    The attestationIds parameter is a comma-separated list of attestation IDs
 *    Usage: ts-node src/scripts/query-nodes-by-attestation.ts nodes 1,2,3
 *
 * 4. audit <communityId> <attestationIds>
 *    Performs a comprehensive audit of nodes in a specific community that have
 *    validated attestations matching the provided IDs. The audit:
 *    - Checks if nodes are properly submitted to the community
 *    - Verifies presence of UUID and DPID
 *    - Attempts to detect missing DPIDs from the nodes API
 *    - Reports any issues found
 *
 *    Parameters:
 *    - communityId: The ID of the community to audit
 *    - attestationIds: Comma-separated list of attestation IDs to check for
 *
 *    Usage: ts-node src/scripts/query-nodes-by-attestation.ts audit 1 1,2,3
 *
 * 5. fix <communityId> <attestationIds>
 *    Applies fixes for missing DPIDs found in the audit. This command:
 *    - First runs an audit to identify nodes needing fixes
 *    - Shows a detailed preview of changes to be made
 *    - Requires multiple confirmations before proceeding
 *    - Only updates legacyDpid field for nodes missing it
 *    - Provides a summary of changes made
 *
 *    Parameters:
 *    - communityId: The ID of the community to fix
 *    - attestationIds: Comma-separated list of attestation IDs to check for
 *
 *    Usage: ts-node src/scripts/query-nodes-by-attestation.ts fix 1 1,2,3
 *
 * Output:
 * - All commands provide formatted table output
 * - The audit command provides detailed status for each node including:
 *   - Missing community submissions
 *   - Missing UUIDs
 *   - Missing DPIDs (with status of API detection attempts)
 *
 * Dependencies:
 * - @prisma/client: For database operations
 * - axios: For making HTTP requests to the nodes API
 */

import * as readline from 'readline';

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const NODES_API_BASE_URL = 'https://nodes-api.desci.com/v1/nodes/published';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

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

// Helper function to fetch DPID from API
async function fetchDpidFromApi(uuid: string): Promise<string | null> {
  try {
    const response = await axios.get(`${NODES_API_BASE_URL}/${uuid}`);
    if (response.data?.dpid) {
      return response.data.dpid;
    }
    return null;
  } catch (error) {
    console.error(`Failed to fetch DPID for UUID ${uuid}:`, error.message);
    return null;
  }
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

// Types
interface NodeWithAttestations {
  id: number;
  title: string;
  uuid: string | null;
  dpidAlias: number | null;
  legacyDpid: number | null;
  NodeAttestation: {
    attestationId: number;
    attestation: {
      name: string;
    };
  }[];
}

interface NodeToFix {
  id: number;
  title: string;
  uuid: string;
  dpid: string;
}

// Helper function to parse command line arguments
function parseArgs(args: string[]): { communityId: number; attestationIds: number[] } {
  if (args.length < 2) {
    console.error('Error: Both communityId and attestationId(s) are required.');
    console.error(
      'Usage: ts-node src/scripts/query-nodes-by-attestation.ts <command> <communityId> <attestationId>[,attestationId2,...]',
    );
    process.exit(1);
  }

  const communityId = parseInt(args[0], 10);
  const attestationIds = args[1]
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (isNaN(communityId) || attestationIds.length === 0) {
    console.error('Error: Invalid communityId or attestationId(s).');
    console.error(
      'Usage: ts-node src/scripts/query-nodes-by-attestation.ts <command> <communityId> <attestationId>[,attestationId2,...]',
    );
    process.exit(1);
  }

  return { communityId, attestationIds };
}

// Helper function to get nodes with attestations
async function getNodesWithAttestations(attestationIds: number[]): Promise<NodeWithAttestations[]> {
  return prisma.node.findMany({
    where: {
      OR: attestationIds.map((attestationId) => ({
        NodeAttestation: {
          some: {
            attestationId: attestationId,
            NodeAttestationVerification: {
              some: {},
            },
          },
        },
      })),
    },
    select: {
      id: true,
      title: true,
      uuid: true,
      dpidAlias: true,
      legacyDpid: true,
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
  });
}

// Helper function to get community details
async function getCommunityDetails(communityId: number) {
  const community = await prisma.desciCommunity.findUnique({
    where: { id: communityId },
    select: { id: true, name: true },
  });

  if (!community) {
    console.error(`Error: Community with ID ${communityId} not found.`);
    process.exit(1);
  }

  return community;
}

// Helper function to get existing community submissions
async function getExistingSubmissions(communityId: number) {
  const existingSubmissions = await prisma.communitySubmission.findMany({
    where: {
      communityId: communityId,
    },
    select: {
      nodeId: true,
    },
  });

  const nodesInSubmissions = await prisma.node.findMany({
    where: {
      uuid: {
        in: existingSubmissions.map((s) => s.nodeId),
      },
    },
    select: {
      id: true,
      uuid: true,
    },
  });

  return new Set(nodesInSubmissions.map((n) => n.id.toString()));
}

// Helper function to check if a node has a DPID
function hasDpid(node: { dpidAlias: number | null; legacyDpid: number | null }): boolean {
  return !!node.dpidAlias; // || !!node.legacyDpid;
}

// Helper function to find nodes that need DPID fixes
async function findNodesNeedingDpidFixes(nodes: NodeWithAttestations[]): Promise<NodeToFix[]> {
  const nodesToFix: NodeToFix[] = [];

  for (const node of nodes) {
    if (!hasDpid(node) && node.uuid) {
      const dpid = await fetchDpidFromApi(node.uuid);
      if (dpid) {
        nodesToFix.push({
          id: node.id,
          title: node.title,
          uuid: node.uuid,
          dpid: dpid,
        });
      }
    }
  }

  return nodesToFix;
}

async function auditCommunity(communityId: number, attestationIds: number[]) {
  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds);
  const existingNodeIds = await getExistingSubmissions(communityId);

  console.log(`Found ${nodesWithAttestations.length} nodes with any of the required validated attestations.\n`);
  console.log(`Found ${existingNodeIds.size} existing submissions in the community.`);

  // Analyze results
  const rows: string[][] = [];

  for (const node of nodesWithAttestations) {
    const issues: string[] = [];
    const nodeIdStr = node.id.toString();

    if (!existingNodeIds.has(nodeIdStr)) {
      issues.push('Not in community submissions');
    }

    if (!node.uuid) {
      issues.push('Missing UUID');
    }

    if (!hasDpid(node) && node.uuid) {
      const dpid = await fetchDpidFromApi(node.uuid);
      if (dpid) {
        issues.push(`Missing DPID (Found in API: ${dpid})`);
      } else {
        issues.push('Missing DPID (Not found in API)');
      }
    } else if (!hasDpid(node)) {
      issues.push('Missing DPID');
    }

    if (issues.length > 0) {
      rows.push([nodeIdStr, node.title, issues.join('; ')]);
    }
  }

  // Print results
  console.log(`\nAudit Results for ${community.name}:`);
  if (rows.length === 0) {
    console.log('✓ All nodes with required attestations are properly submitted and have valid UUID/DPID.');
  } else {
    console.log(`Found ${rows.length} nodes that need attention:`);
    formatTable(rows, ['Node ID', 'Title', 'Issues']);
  }
}

async function fixCommunity(communityId: number, attestationIds: number[]) {
  console.log('Running audit to identify nodes needing fixes...\n');

  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds);
  const nodesToFix = await findNodesNeedingDpidFixes(nodesWithAttestations);

  if (nodesToFix.length === 0) {
    console.log('No nodes found that need DPID fixes.');
    return;
  }

  // Show preview of changes
  console.log(`\nFound ${nodesToFix.length} nodes that need DPID fixes:`);
  formatTable(
    nodesToFix.map((n) => [n.id.toString(), n.title, n.uuid, n.dpid]),
    ['Node ID', 'Title', 'UUID', 'DPID to Add'],
  );

  // Multiple confirmation steps
  console.log('\n⚠️  IMPORTANT: This will update the legacyDpid field for the nodes listed above.');
  console.log('   No other fields will be modified.');

  const confirm1 = await askQuestion('\nDo you want to proceed with these changes?');
  if (!confirm1) {
    console.log('Operation cancelled.');
    return;
  }

  const confirm2 = await askQuestion('\nAre you absolutely sure? This will modify the database.');
  if (!confirm2) {
    console.log('Operation cancelled.');
    return;
  }

  // Final safety check - verify nodes haven't changed
  const finalCheck = await prisma.node.findMany({
    where: {
      id: { in: nodesToFix.map((n) => n.id) },
    },
    select: {
      id: true,
      dpidAlias: true,
      legacyDpid: true,
    },
  });

  // Verify no nodes have been modified since we started
  const nodesChanged = finalCheck.some((node) => {
    const original = nodesToFix.find((n) => n.id === node.id);
    return !original || hasDpid(node);
  });

  if (nodesChanged) {
    console.error('\n⚠️  Safety check failed: Some nodes have been modified since the audit.');
    console.error('Please run the audit again to get fresh data.');
    return;
  }

  // Proceed with updates
  console.log('\nApplying fixes...');
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const node of nodesToFix) {
    try {
      // Additional safety check
      if (!node.id || typeof node.id !== 'number') {
        console.error(`Skipping node with invalid ID: ${JSON.stringify(node)}`);
        skippedCount++;
        continue;
      }

      // Check if node still needs update
      const currentState = await prisma.node.findUnique({
        where: { id: node.id },
        select: { dpidAlias: true, legacyDpid: true },
      });

      if (!currentState) {
        console.error(`Skipping node ${node.id}: Node no longer exists`);
        skippedCount++;
        continue;
      }

      if (currentState.dpidAlias || currentState.legacyDpid) {
        console.log(
          `Skipping node ${node.id}: Already has DPID (dpidAlias: ${currentState.dpidAlias}, legacyDpid: ${currentState.legacyDpid})`,
        );
        skippedCount++;
        continue;
      }

      await prisma.node.update({
        where: { id: node.id },
        data: { legacyDpid: parseInt(node.dpid, 10) },
      });
      successCount++;
    } catch (error) {
      console.error(`Failed to update node ${node.id}:`, error.message);
      errorCount++;
    }
  }

  // Summary
  console.log('\nFix operation completed:');
  console.log(`- Successfully updated: ${successCount} nodes`);
  if (skippedCount > 0) {
    console.log(`- Skipped: ${skippedCount} nodes (already have DPID or invalid state)`);
  }
  if (errorCount > 0) {
    console.log(`- Failed to update: ${errorCount} nodes`);
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

// Helper function to get user confirmation
function askQuestion(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (
    !command ||
    (command !== 'attestations' &&
      command !== 'nodes' &&
      command !== 'communities' &&
      command !== 'audit' &&
      command !== 'fix')
  ) {
    console.error('Usage:');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts attestations');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts nodes <attestationId>[,attestationId2,...]');
    console.error('  ts-node src/scripts/query-nodes-by-attestation.ts communities');
    console.error(
      '  ts-node src/scripts/query-nodes-by-attestation.ts audit <communityId> <attestationId>[,attestationId2,...]',
    );
    console.error(
      '  ts-node src/scripts/query-nodes-by-attestation.ts fix <communityId> <attestationId>[,attestationId2,...]',
    );
    process.exit(1);
  }

  try {
    if (command === 'attestations') {
      await listAttestations();
    } else if (command === 'communities') {
      await listCommunities();
    } else if (command === 'audit' || command === 'fix') {
      const { communityId, attestationIds } = parseArgs(args);
      if (command === 'audit') {
        await auditCommunity(communityId, attestationIds);
      } else {
        await fixCommunity(communityId, attestationIds);
      }
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
    rl.close();
  }
}

main();
