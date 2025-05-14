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
 * - dotenv: For environment variable management
 */

import * as readline from 'readline';

import { PrismaClient, Submissionstatus, Prisma } from '@prisma/client';
import axios from 'axios';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();
const SERVER_URL = process.env.SERVER_URL || 'https://nodes-api.desci.com';
const NODES_API_BASE_URL = `${SERVER_URL}/v1/nodes/published`;

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Formats and displays tabular data in the console
 * @param rows - Array of string arrays representing table rows
 * @param headers - Array of column headers
 */
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

/**
 * Validates a DPID string
 * @param dpid - The DPID to validate
 * @returns boolean indicating if the DPID is valid
 */
function isValidDpid(dpid: string): boolean {
  const dpidNum = parseInt(dpid, 10);
  return !isNaN(dpidNum) && dpidNum > 0;
}

/**
 * Checks if a node has a DPID
 * @param node - Node object to check
 * @returns True if node has a DPID, false otherwise
 */
function hasDpid(node: { dpidAlias: number | null; legacyDpid: number | null }): boolean {
  return !!node.dpidAlias || !!node.legacyDpid;
}

/**
 * Fetches DPID for a node from the nodes API with timeout
 * @param uuid - The UUID of the node to fetch DPID for
 * @param nodeId - The ID of the node
 * @param title - The title of the node
 * @returns The DPID if found, null otherwise
 */
async function fetchDpidFromApi(uuid: string, nodeId: number, title: string): Promise<string | null> {
  const url = `${NODES_API_BASE_URL}/${uuid}`;
  try {
    const response = await axios.get(url, {
      timeout: 5000, // 5 second timeout
    });

    if (response.data?.dpid && isValidDpid(response.data.dpid)) {
      return response.data.dpid;
    }
    console.error(`Invalid DPID format in API response for Node ${nodeId} (${title}):`, response.data?.dpid);
    console.error(`UUID: ${uuid}`);
    console.error(`Check URL: ${url}`);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        console.error(`Timeout fetching DPID for Node ${nodeId} (${title})`);
        console.error(`UUID: ${uuid}`);
        console.error(`Check URL: ${url}`);
      } else if (error.response?.status === 404) {
        console.error(`Failed to fetch DPID for Node ${nodeId} (${title}): Request failed with status code 404`);
        console.error(`UUID: ${uuid}`);
        console.error(`Check URL: ${url}`);
      } else {
        console.error(`Failed to fetch DPID for Node ${nodeId} (${title}):`, error.message);
        console.error(`UUID: ${uuid}`);
        console.error(`Check URL: ${url}`);
      }
    } else {
      console.error(`Unexpected error fetching DPID for Node ${nodeId} (${title}):`, error);
      console.error(`UUID: ${uuid}`);
      console.error(`Check URL: ${url}`);
    }
    return null;
  }
}

/**
 * Lists all available attestations in a formatted table
 */
async function listAttestations() {
  const attestations = await prisma.attestation.findMany({
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  });

  const rows = attestations.map((att) => [att.id.toString(), att.name]);

  formatTable(rows, ['ID', 'Name']);
}

/**
 * Lists all DeSci communities with their submission counts
 */
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

/**
 * Parses command line arguments for community and attestation IDs
 * @param args - Array of command line arguments
 * @returns Object containing parsed communityId and attestationIds
 * @throws Error if arguments are invalid
 */
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

/**
 * Retrieves nodes that have validated attestations matching the provided IDs
 * @param attestationIds - Array of attestation IDs to match
 * @returns Array of nodes with their attestation details
 */
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

/**
 * Retrieves details for a specific community
 * @param communityId - The ID of the community to retrieve
 * @returns Community details
 * @throws Error if community is not found
 */
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

/**
 * Retrieves existing community submissions for a community
 * @param communityId - The ID of the community
 * @returns Set of node IDs that are in community submissions
 */
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

/**
 * Checks if a community submission exists
 * @param tx - Prisma transaction client
 * @param communityId - The community ID
 * @param nodeId - The node ID
 * @returns boolean indicating if submission exists
 */
async function submissionExists(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>,
  communityId: number,
  nodeId: string,
): Promise<boolean> {
  const existing = await tx.communitySubmission.findFirst({
    where: {
      communityId,
      nodeId,
    },
  });
  return !!existing;
}

/**
 * Finds nodes that need DPID fixes by checking the nodes API
 * @param nodes - Array of nodes to check
 * @returns Array of nodes that need DPID fixes
 */
async function findNodesNeedingDpidFixes(nodes: NodeWithAttestations[]): Promise<NodeToFix[]> {
  const nodesToFix: NodeToFix[] = [];

  for (const node of nodes) {
    if (!hasDpid(node) && node.uuid) {
      const dpid = await fetchDpidFromApi(node.uuid, node.id, node.title);
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

/**
 * Performs an audit of nodes in a community with specific attestations
 * @param communityId - The ID of the community to audit
 * @param attestationIds - Array of attestation IDs to check for
 */
async function auditCommunity(communityId: number, attestationIds: number[]) {
  console.log('\n🔍 Audit Configuration:');
  console.log(`Target API URL: ${NODES_API_BASE_URL}`);
  console.log(`Community ID: ${communityId}`);
  console.log(`Attestation IDs: ${attestationIds.join(', ')}\n`);

  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds);

  // Get all submissions for the community with detailed information
  const submissions = await prisma.communitySubmission.findMany({
    where: {
      communityId: communityId,
    },
    select: {
      nodeId: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      node: {
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
              attestation: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  const existingNodeIds = new Set(submissions.map((s) => s.node.id.toString()));

  console.log(`Found ${nodesWithAttestations.length} nodes with any of the required validated attestations.\n`);
  console.log(`Found ${submissions.length} existing submissions in the community.`);

  // Analyze results
  const missingSubmissionRows: string[][] = [];
  const missingDpidRows: string[][] = [];
  const otherIssueRows: string[][] = [];
  const validRows: string[][] = [];

  // First, show all submissions with their details
  console.log('\nAll Community Submissions:');
  const submissionRows = submissions.map((sub) => [
    sub.node.id.toString(),
    sub.node.title,
    sub.status,
    sub.node.dpidAlias?.toString() || 'N/A',
    sub.node.legacyDpid?.toString() || 'N/A',
    sub.node.NodeAttestation.map((na) => na.attestation.name).join(', '),
    sub.createdAt.toISOString(),
  ]);
  formatTable(submissionRows, ['Node ID', 'Title', 'Status', 'DPID', 'Legacy DPID', 'Attestations', 'Created At']);

  // Then analyze nodes with attestations
  for (const node of nodesWithAttestations) {
    const issues: string[] = [];
    const nodeIdStr = node.id.toString();

    // Find the submission for this node
    const submission = submissions.find((s) => s.node.id === node.id);

    let dpidStatus = '';
    let dpidApi = null;
    if (submission) {
      dpidStatus =
        submission.node.dpidAlias || submission.node.legacyDpid
          ? `Present (${submission.node.dpidAlias || submission.node.legacyDpid})`
          : 'Missing';
    } else if (node.uuid) {
      dpidApi = await fetchDpidFromApi(node.uuid, node.id, node.title);
      dpidStatus = dpidApi ? `Found in API: ${dpidApi}` : 'Not found in API';
    } else {
      dpidStatus = 'No UUID';
    }

    if (!submission) {
      missingSubmissionRows.push([nodeIdStr, node.title, 'Not in community submissions', dpidStatus]);
      continue;
    }

    if (!node.uuid) {
      issues.push('Missing UUID');
    }

    // Check DPID in the submission's node
    const hasDpidInSubmission = !!submission.node.dpidAlias || !!submission.node.legacyDpid;
    if (!hasDpidInSubmission && node.uuid) {
      const dpid = await fetchDpidFromApi(node.uuid, node.id, node.title);
      if (dpid) {
        missingDpidRows.push([nodeIdStr, node.title, `Missing DPID (Found in API: ${dpid})`]);
      } else {
        missingDpidRows.push([nodeIdStr, node.title, 'Missing DPID (Not found in API)']);
      }
    } else if (!hasDpidInSubmission) {
      issues.push('Missing DPID');
    }

    // Only mark as properly configured if there are no issues and DPID is present in submission
    if (issues.length === 0 && hasDpidInSubmission) {
      validRows.push([
        nodeIdStr,
        node.title,
        `✓ Properly configured (DPID: ${submission.node.dpidAlias || submission.node.legacyDpid})`,
      ]);
    } else if (issues.length > 0) {
      otherIssueRows.push([nodeIdStr, node.title, issues.join('; ')]);
    }
  }

  // Print results
  console.log(`\nAudit Results for ${community.name}:`);

  if (validRows.length > 0) {
    console.log(`\nProperly configured nodes (${validRows.length}):`);
    formatTable(validRows, ['Node ID', 'Title', 'Status']);
  }

  if (missingSubmissionRows.length > 0) {
    console.log(`\nNodes to be added to community submissions (${missingSubmissionRows.length}):`);
    formatTable(missingSubmissionRows, ['Node ID', 'Title', 'Status', 'DPID Status']);
  }

  if (missingDpidRows.length > 0) {
    console.log(`\nNodes needing DPID updates (${missingDpidRows.length}):`);
    formatTable(missingDpidRows, ['Node ID', 'Title', 'Status']);
  }

  if (otherIssueRows.length > 0) {
    console.log(`\nOther issues found (${otherIssueRows.length}):`);
    formatTable(otherIssueRows, ['Node ID', 'Title', 'Issues']);
  }

  if (missingSubmissionRows.length === 0 && missingDpidRows.length === 0 && otherIssueRows.length === 0) {
    console.log('✓ All nodes with required attestations are properly submitted and have valid UUID/DPID.');
  }

  // Summary
  console.log('\nSummary:');
  console.log(`- Total submissions in community: ${submissions.length}`);
  console.log(`- Properly configured nodes: ${validRows.length}`);
  console.log(`- Nodes to be added to submissions: ${missingSubmissionRows.length}`);
  console.log(`- Nodes needing DPID updates: ${missingDpidRows.length}`);
  console.log(`- Nodes with other issues: ${otherIssueRows.length}`);
  console.log(`Total nodes with attestations: ${nodesWithAttestations.length}`);
}

/**
 * Applies fixes for nodes in a community that need DPID updates
 * @param communityId - The ID of the community to fix
 * @param attestationIds - Array of attestation IDs to check for
 */
async function fixCommunity(communityId: number, attestationIds: number[]) {
  console.log('\n🔧 Fix Configuration:');
  console.log(`Target API URL: ${NODES_API_BASE_URL}`);
  console.log(`Community ID: ${communityId}`);
  console.log(`Attestation IDs: ${attestationIds.join(', ')}\n`);

  console.log('Running audit to identify nodes needing fixes...\n');

  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds);
  const existingNodeIds = await getExistingSubmissions(communityId);
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
  console.log('\n⚠️  IMPORTANT: This will:');
  console.log('   1. Update the legacyDpid field for nodes missing it');
  console.log('   2. Add nodes to community submissions if they have validated attestations');
  console.log(`   3. Use API URL: ${NODES_API_BASE_URL}`);

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

  // Proceed with updates using a transaction
  console.log('\nApplying fixes...');
  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  let addedToCommunityCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      for (const node of nodesToFix) {
        try {
          // Additional safety check
          if (!node.id || typeof node.id !== 'number') {
            console.error(`Skipping node with invalid ID: ${JSON.stringify(node)}`);
            skippedCount++;
            continue;
          }

          if (!isValidDpid(node.dpid)) {
            console.error(`Skipping node ${node.id}: Invalid DPID format: ${node.dpid}`);
            skippedCount++;
            continue;
          }

          // Check if node still needs update
          const currentState = await tx.node.findUnique({
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

          // Check if node is in community submissions
          const isInCommunity = await submissionExists(tx, communityId, node.uuid);
          if (!isInCommunity) {
            // Get node version and owner
            const nodeVersion = await tx.nodeVersion.count({
              where: {
                node: { uuid: node.uuid },
                OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
              },
            });

            const nodeDetails = await tx.node.findUnique({
              where: { uuid: node.uuid },
              select: { ownerId: true },
            });

            if (!nodeDetails) {
              console.error(`Node ${node.id} not found in database`);
              errorCount++;
              continue;
            }

            // Double-check before creating submission
            if (!(await submissionExists(tx, communityId, node.uuid))) {
              await tx.communitySubmission.create({
                data: {
                  communityId: communityId,
                  nodeId: node.uuid,
                  userId: nodeDetails.ownerId,
                  nodeVersion,
                  status: Submissionstatus.ACCEPTED,
                },
              });
              console.log(`Added node ${node.id} to community submissions`);
              addedToCommunityCount++;
            } else {
              console.log(`Node ${node.id} already in community submissions`);
            }
          }

          // Update node DPID
          await tx.node.update({
            where: { id: node.id },
            data: { legacyDpid: parseInt(node.dpid, 10) },
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to update node ${node.id}:`, error instanceof Error ? error.message : String(error));
          errorCount++;
          throw error; // This will trigger transaction rollback
        }
      }
    });
  } catch (error) {
    console.error(
      '\n⚠️  Transaction failed and was rolled back:',
      error instanceof Error ? error.message : String(error),
    );
    return;
  }

  // Summary
  console.log('\nFix operation completed:');
  console.log(`- Successfully updated: ${successCount} nodes`);
  if (addedToCommunityCount > 0) {
    console.log(`- Added to community: ${addedToCommunityCount} nodes`);
  }
  if (skippedCount > 0) {
    console.log(`- Skipped: ${skippedCount} nodes (already have DPID or invalid state)`);
  }
  if (errorCount > 0) {
    console.log(`- Failed to update: ${errorCount} nodes`);
  }
}

/**
 * Lists nodes that have validated attestations matching the provided IDs
 * @param attestationIds - Array of attestation IDs to match
 */
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

/**
 * Prompts the user for confirmation
 * @param question - The question to ask the user
 * @returns Promise that resolves to true if user confirms, false otherwise
 */
function askQuestion(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main entry point for the CLI tool
 */
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
