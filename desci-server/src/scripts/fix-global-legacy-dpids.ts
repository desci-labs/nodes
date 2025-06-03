/**
 * Global Legacy DPID Fixer CLI
 *
 * This CLI tool identifies published nodes that are missing both legacyDpid and dpidAlias,
 * attempts to fetch a DPID for them, and updates their legacyDpid field.
 *
 *
 * Usage:
 * npm run script:backfill-legacy-dpids - DRY RUN
 * DO_WRITES=true npm run script:backfill-legacy-dpids - THIS WILL WRITE TO THE DB.
 *
 * The script will:
 * - Scan all nodes in the database.
 * - Filter for nodes where:
 *   - legacyDpid IS NULL
 *   - dpidAlias IS NULL
 *   - uuid IS NOT NULL
 *   - state IS VALIDATED
 * - For each such node, attempt to fetch a DPID from the Nodes API or its manifest.
 * - Present a list of nodes for which a DPID was found and can be fixed.
 * - Require multiple confirmations before applying any database changes.
 * - Update the legacyDpid field for the confirmed nodes.
 * - Provide a summary of changes made.
 */

import * as readline from 'readline';

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

import { getManifestByCid } from '../services/data/processing.js';
import { ensureUuidEndsWithDot } from '../utils.js';

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

interface NodeToFixInfo {
  id: number;
  title: string;
  uuid: string;
  dpid: string;
  ceramicStream: string;
}

/**
 * Formats and displays tabular data in the console
 * @param rows - Array of string arrays representing table rows
 * @param headers - Array of column headers
 */
function formatTable(rows: string[][], headers: string[]) {
  if (rows.length === 0) {
    console.log('No data to display.');
    return;
  }
  const colWidths = headers.map((_, i) => Math.max(headers[i].length, ...rows.map((row) => (row[i] || '').length)));
  console.log('\n' + headers.map((h, i) => h.padEnd(colWidths[i])).join('  '));
  console.log(headers.map((_, i) => '-'.repeat(colWidths[i])).join('  '));
  rows.forEach((row) => {
    console.log(row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join('  '));
  });
  console.log();
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

export async function getDpidFromNodeUuid(nodeUuid: string): Promise<number | string | undefined> {
  const node = await prisma.node.findUnique({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    select: { manifestUrl: true },
  });

  try {
    if (!node?.manifestUrl) throw new Error('No manifest URL found for node');
    const manifestCid = node.manifestUrl;
    const manifest = await getManifestByCid(manifestCid);
    return manifest?.dpid?.id;
  } catch (e) {
    console.log(`failing to resolve the manifest for ${nodeUuid}`, e);
    return undefined;
  }
}

/**
 * Main function to find and fix missing legacy DPIDs for published nodes.
 */
async function fixAllMissingLegacyDpids() {
  console.log('🔍 Starting scan for published nodes missing legacyDpid and dpidAlias...');
  console.log(`Target API URL for DPID lookup (if manifest fails): ${NODES_API_BASE_URL}`);
  console.log(`Target IPFS Gateway for manifest lookup: ${IPFS_NODE_URL}`);

  const candidateNodes = await prisma.node.findMany({
    where: {
      dpidAlias: null,
      legacyDpid: null,
      versions: {
        some: {
          OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (candidateNodes.length === 0) {
    console.log(
      '✅ No published nodes found that require legacyDpid fixes (missing both legacyDpid and dpidAlias and are VALIDATED).',
    );
    return;
  }

  console.log(`\nFound ${candidateNodes.length} candidate published nodes. Attempting to fetch DPIDs...`);

  const nodesToFix: NodeToFixInfo[] = [];
  for (const node of candidateNodes) {
    if (!node.uuid) continue;

    const dpid = (await getDpidFromNodeUuid(node.uuid))?.toString();

    if (dpid && isValidDpid(dpid)) {
      nodesToFix.push({
        id: node.id,
        title: node.title,
        uuid: node.uuid,
        dpid: dpid,
        ceramicStream: node.ceramicStream ?? '',
      });
    }
  }

  if (nodesToFix.length === 0) {
    console.log('ℹ️  No DPIDs could be found for the candidate nodes. No fixes to apply.');
    return;
  }

  console.log(`\nIdentified ${nodesToFix.length} nodes for which a DPID was found and can be fixed:`);
  formatTable(
    nodesToFix
      .sort((a, b) => parseInt(a.dpid, 10) - parseInt(b.dpid, 10))
      .map((n) => [n.id.toString(), n.title.slice(0, 30), n.uuid, n.dpid, n.ceramicStream]),
    ['Node ID', 'Title', 'UUID', 'DPID to Add (legacyDpid)', 'Ceramic Stream'],
  );

  console.log('\n⚠️  IMPORTANT: This script will update the `legacyDpid` field for the nodes listed above.');
  const confirm1 = await askQuestion('Do you want to proceed with these changes?');
  if (!confirm1) {
    console.log('Operation cancelled.');
    return;
  }

  const confirm2 = await askQuestion('Are you absolutely sure? This will modify the database.');
  if (!confirm2) {
    console.log('Operation cancelled.');
    return;
  }

  console.log('\nfucking sneding it...');
  let successCount = 0;
  let errorCount = 0;

  try {
    if (process.env.DO_WRITES === 'true') {
      await prisma.$transaction(
        async (transaction) => {
          for (const nodeFixInfo of nodesToFix) {
            try {
              await transaction.node.update({
                where: { id: nodeFixInfo.id },
                data: { legacyDpid: parseInt(nodeFixInfo.dpid, 10) },
              });

              successCount++;
              console.log(`Successfully updated legacyDpid for Node ID ${nodeFixInfo.id} to ${nodeFixInfo.dpid}.`);
            } catch (error) {
              console.error(
                `Failed to update legacyDpid for Node ID ${nodeFixInfo.id}:`,
                error instanceof Error ? error.message : String(error),
              );
              errorCount++;
            }
          }
        },
        { timeout: 60000 },
      ); // 60 seconds timeout for the transaction
    }
  } catch (txError) {
    console.error('\n⚠️  Transaction failed:', txError instanceof Error ? txError.message : String(txError));
    // Potentially add more error handling or re-throw
  }

  console.log('\nFix operation summary:');
  console.log(`- Successfully updated DPIDs: ${successCount} nodes`);
  console.log(`- Failed to update: ${errorCount} nodes`);
}

/**
 * Main entry point for the CLI tool
 */
async function main() {
  try {
    await fixAllMissingLegacyDpids();
  } catch (error) {
    console.error('An unexpected error occurred:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    rl.close();
  }
}

main();
