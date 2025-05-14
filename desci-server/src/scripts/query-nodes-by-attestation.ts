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
const IPFS_NODE_URL = process.env.IPFS_READ_ONLY_GATEWAY_SERVER_URL || 'https://ipfs.desci.com';

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
 * Fetches DPID from the manifest file in the latest NodeVersion
 * @param nodeId - The ID of the node
 * @returns The DPID if found in manifest, null otherwise
 */
async function fetchDpidFromManifest(nodeId: number): Promise<string | null> {
  try {
    // Get the latest NodeVersion with a commitId
    const latestVersion = await prisma.nodeVersion.findFirst({
      where: {
        nodeId,
        commitId: { not: null },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!latestVersion) {
      console.log(`No version with commitId found for node ${nodeId}`);
      return null;
    }

    if (!latestVersion.manifestUrl) {
      console.log(`No manifestUrl found for node version ${latestVersion.id}`);
      return null;
    }

    // Construct the full IPFS URL
    const manifestUrl = `${IPFS_NODE_URL}/${latestVersion.manifestUrl}`;
    const response = await fetch(manifestUrl);
    if (!response.ok) {
      console.log(`Failed to fetch manifest from ${manifestUrl}`);
      return null;
    }

    const manifest = await response.json();
    // Handle the new DPID format from manifest
    if (manifest.dpid && typeof manifest.dpid === 'object' && manifest.dpid.id) {
      return manifest.dpid.id;
    }
    return manifest.dpid || null;
  } catch (error) {
    console.error(`Error fetching manifest for node ${nodeId}:`, error);
    return null;
  }
}

/**
 * Fetches DPID for a node from the nodes API with timeout
 * @param uuid - The UUID of the node to fetch DPID for
 * @param nodeId - The ID of the node
 * @param title - The title of the node
 * @returns The DPID if found, null otherwise
 */
async function fetchDpidFromApi(
  uuid: string,
  nodeId: number,
  title: string,
): Promise<{ dpid: string | null; source: 'api' | 'manifest' }> {
  const url = `${NODES_API_BASE_URL}/${uuid}`;
  try {
    const response = await axios.get(url, {
      timeout: 5000, // 5 second timeout
    });

    // Handle both string and object DPID formats
    const dpid = response.data?.dpid;
    if (dpid) {
      // If dpid is an object, try to get the numeric value
      const dpidValue = typeof dpid === 'object' ? dpid.toString() : dpid;
      if (isValidDpid(dpidValue)) {
        return { dpid: dpidValue, source: 'api' };
      }
    }

    // If API call fails or returns invalid DPID, try fetching from manifest
    console.log(`Trying to fetch DPID from manifest for Node ${nodeId} (${title})`);
    const manifestDpid = await fetchDpidFromManifest(nodeId);
    if (manifestDpid) {
      return { dpid: manifestDpid, source: 'manifest' };
    }

    console.error(`Invalid DPID format in API response for Node ${nodeId} (${title}):`, response.data?.dpid);
    console.error(`UUID: ${uuid}`);
    console.error(`Check URL: ${url}`);
    return { dpid: null, source: 'api' };
  } catch (error) {
    // If API call fails, try fetching from manifest
    console.log(`API call failed, trying to fetch DPID from manifest for Node ${nodeId} (${title})`);
    const manifestDpid = await fetchDpidFromManifest(nodeId);
    if (manifestDpid) {
      return { dpid: manifestDpid, source: 'manifest' };
    }

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
    return { dpid: null, source: 'api' };
  }
}

/**
 * Lists all available attestations in a formatted table
 */
async function listAttestations() {
  // Get all attestations
  const attestations = await prisma.attestation.findMany({
    select: {
      id: true,
      name: true,
      protected: true,
    },
    orderBy: { id: 'asc' },
  });

  // Get counts for each attestation
  const attestationCounts = await Promise.all(
    attestations.map(async (att) => {
      const [totalCount, validatedCount] = await Promise.all([
        prisma.nodeAttestation.count({
          where: { attestationId: att.id },
        }),
        prisma.nodeAttestation.count({
          where: {
            attestationId: att.id,
            NodeAttestationVerification: {
              some: {},
            },
          },
        }),
      ]);
      return { id: att.id, totalCount, validatedCount };
    }),
  );

  // Combine the data
  const rows = attestations.map((att) => {
    const counts = attestationCounts.find((c) => c.id === att.id);
    return [
      att.id.toString(),
      att.name,
      att.protected ? 'Yes' : 'No',
      counts?.totalCount.toString() || '0',
      counts?.validatedCount.toString() || '0',
    ];
  });

  formatTable(rows, ['ID', 'Name', 'Protected', 'Total Nodes', 'Validated Nodes']);
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
  ownerId: number;
  NodeAttestation: {
    attestationId: number;
    attestation: {
      name: string;
    };
  }[];
}

interface NodeVersion {
  id: number;
  manifestUrl: string;
  commitId: string | null;
  createdAt: Date;
}

interface NodeToFix {
  id: number;
  title: string;
  uuid: string;
  dpid: string;
}

interface CommunitySubmission {
  id: number;
  nodeId: string;
  userId: number;
  status: string;
  node: {
    id: number;
    title: string;
    uuid: string;
    ownerId: number;
    dpidAlias: number | null;
    legacyDpid: number | null;
  };
}

/**
 * Parses command line arguments for community and attestation IDs
 * @param args - Array of command line arguments
 * @returns Object containing parsed communityId, attestationIds, and includeUnvalidated flag
 * @throws Error if arguments are invalid
 */
function parseArgs(args: string[]): { communityId: number; attestationIds: number[]; includeUnvalidated: boolean } {
  if (args.length < 2) {
    console.error('Error: Both communityId and attestationId(s) are required.');
    console.error(
      'Usage: ts-node src/scripts/query-nodes-by-attestation.ts <command> <communityId> <attestationId>[,attestationId2,...] [--unvalidated]',
    );
    process.exit(1);
  }

  const includeUnvalidated = args.includes('--unvalidated');
  const filteredArgs = args.filter((arg) => arg !== '--unvalidated');

  const communityId = parseInt(filteredArgs[0], 10);
  const attestationIds = filteredArgs[1]
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !isNaN(id));

  if (isNaN(communityId) || attestationIds.length === 0) {
    console.error('Error: Invalid communityId or attestationId(s).');
    console.error(
      'Usage: ts-node src/scripts/query-nodes-by-attestation.ts <command> <communityId> <attestationId>[,attestationId2,...] [--unvalidated]',
    );
    process.exit(1);
  }

  return { communityId, attestationIds, includeUnvalidated };
}

/**
 * Retrieves nodes that have validated attestations matching the provided IDs
 * @param attestationIds - Array of attestation IDs to match
 * @param includeUnvalidated - Whether to include unvalidated attestations
 * @returns Array of nodes with their attestation details
 */
async function getNodesWithAttestations(
  attestationIds: number[],
  includeUnvalidated: boolean = false,
): Promise<NodeWithAttestations[]> {
  return prisma.node.findMany({
    where: {
      OR: attestationIds.map((attestationId) => ({
        NodeAttestation: {
          some: {
            attestationId: attestationId,
            ...(includeUnvalidated
              ? {}
              : {
                  NodeAttestationVerification: {
                    some: {},
                  },
                }),
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
      ownerId: true,
      NodeAttestation: {
        where: {
          attestationId: {
            in: attestationIds,
          },
          ...(includeUnvalidated
            ? {}
            : {
                NodeAttestationVerification: {
                  some: {},
                },
              }),
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
      const result = await fetchDpidFromApi(node.uuid, node.id, node.title);
      if (result.dpid) {
        nodesToFix.push({
          id: node.id,
          title: node.title,
          uuid: node.uuid,
          dpid: result.dpid,
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
 * @param includeUnvalidated - Whether to include unvalidated attestations
 */
async function auditCommunity(communityId: number, attestationIds: number[], includeUnvalidated: boolean = false) {
  console.log('\n🔍 Audit Configuration:');
  console.log(`Target API URL: ${NODES_API_BASE_URL}`);
  console.log(`Community ID: ${communityId}`);
  console.log(`Attestation IDs: ${attestationIds.join(', ')}`);
  console.log(`Include Unvalidated: ${includeUnvalidated ? 'Yes' : 'No'}`);

  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds, includeUnvalidated);

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
      userId: true,
      node: {
        select: {
          id: true,
          title: true,
          uuid: true,
          dpidAlias: true,
          legacyDpid: true,
          ownerId: true,
          NodeAttestation: {
            where: {
              attestationId: {
                in: attestationIds,
              },
              ...(includeUnvalidated
                ? {}
                : {
                    NodeAttestationVerification: {
                      some: {},
                    },
                  }),
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

  // Fetch Node data for DPID information
  const nodes = await prisma.node.findMany({
    where: {
      id: {
        in: nodesWithAttestations.map((n) => n.id),
      },
    },
    select: {
      id: true,
      dpidAlias: true,
      legacyDpid: true,
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
  for (const submission of submissions) {
    const node = submission.node;
    if (!node) {
      console.log(`Node not found for submission ${submission.nodeId}`);
      continue;
    }

    let dpidStatus = 'Not found';
    let dpid = null;
    let dpidSource = '';

    // Check if DPID exists in Node table
    if (node.dpidAlias || node.legacyDpid) {
      dpidStatus = 'Present in Node';
      dpid = node.dpidAlias || node.legacyDpid;
    } else {
      // Try to get DPID from API or manifest
      const result = await fetchDpidFromApi(node.uuid, node.id, node.title);
      dpid = result.dpid;
      dpidSource = result.source;
      if (dpid) {
        dpidStatus = `Found in ${dpidSource === 'manifest' ? 'Manifest' : 'API'}`;
      }
    }

    // Check if ownerId matches submission userId
    if (node.ownerId !== submission.userId) {
      otherIssueRows.push([
        node.id.toString(),
        node.title,
        `Owner mismatch (Node owner: ${node.ownerId}, Submission user: ${submission.userId})`,
      ]);
    }

    // Check DPID status
    const hasDpidInSubmission = !!node.dpidAlias || !!node.legacyDpid;
    if (!hasDpidInSubmission && dpid) {
      missingDpidRows.push([
        node.id.toString(),
        node.title,
        `Missing DPID (Found in ${dpidSource === 'manifest' ? 'Manifest' : 'API'}: ${dpid})`,
      ]);
    } else if (!hasDpidInSubmission) {
      missingDpidRows.push([node.id.toString(), node.title, 'Missing DPID (Not found in API)']);
    }

    // Only mark as properly configured if there are no issues and DPID is present in submission
    if (otherIssueRows.length === 0 && hasDpidInSubmission) {
      validRows.push([
        node.id.toString(),
        node.title,
        `✓ Properly configured (DPID: ${node.dpidAlias || node.legacyDpid})`,
      ]);
    } else if (otherIssueRows.length > 0) {
      otherIssueRows.push([node.id.toString(), node.title, otherIssueRows.join('; ')]);
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
 * @param includeUnvalidated - Whether to include unvalidated attestations
 */
async function fixCommunity(communityId: number, attestationIds: number[], includeUnvalidated: boolean = false) {
  console.log('\n🔧 Fix Configuration:');
  console.log(`Target API URL: ${NODES_API_BASE_URL}`);
  console.log(`Community ID: ${communityId}`);
  console.log(`Attestation IDs: ${attestationIds.join(', ')}`);
  console.log(`Include Unvalidated: ${includeUnvalidated ? 'Yes' : 'No'}\n`);

  console.log('Running audit to identify nodes needing fixes...\n');

  const community = await getCommunityDetails(communityId);
  const nodesWithAttestations = await getNodesWithAttestations(attestationIds, includeUnvalidated);
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
      '  ts-node src/scripts/query-nodes-by-attestation.ts audit <communityId> <attestationId>[,attestationId2,...] [--unvalidated]',
    );
    console.error(
      '  ts-node src/scripts/query-nodes-by-attestation.ts fix <communityId> <attestationId>[,attestationId2,...] [--unvalidated]',
    );
    process.exit(1);
  }

  try {
    if (command === 'attestations') {
      await listAttestations();
    } else if (command === 'communities') {
      await listCommunities();
    } else if (command === 'audit' || command === 'fix') {
      const { communityId, attestationIds, includeUnvalidated } = parseArgs(args);
      if (command === 'audit') {
        await auditCommunity(communityId, attestationIds, includeUnvalidated);
      } else {
        await fixCommunity(communityId, attestationIds, includeUnvalidated);
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
