/**
 * Shared helpers for CLI commands.
 * Consolidates common patterns like API key checks, node selection,
 * and private key prompts.
 */

import chalk from "chalk";
import { select, password, input, validatePrivateKey, normalizePrivateKey } from "./prompts.js";
import { getApiKey, getPrivateKey, setPrivateKey } from "./config.js";
import { createSpinner, printError, maskString, printNodeInfo } from "./ui.js";
import { listNodes, createDraftNode } from "@desci-labs/nodes-lib/node";

/**
 * Maximum title length allowed by Ceramic schema for ResearchObjects.
 */
export const MAX_TITLE_LENGTH = 250;

/**
 * Extract error message from an unknown error.
 * @param error - The error to extract message from
 * @returns The error message or "Unknown error"
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

/**
 * Node info returned from listNodes
 */
interface NodeInfo {
  uuid: string;
  title: string;
  isPublished: boolean;
}

/**
 * Options for node resolution
 */
interface ResolveNodeOptions {
  /** Message to show in the picker (default: "Select a node:") */
  selectMessage?: string;
  /** Whether to include the "Create new node" option in picker */
  allowCreate?: boolean;
  /** Message when no nodes are found */
  noNodesMessage?: string;
  /** Whether to also search by title (not just UUID) */
  searchByTitle?: boolean;
}

/**
 * Check if API key is configured and exit with error if not.
 * Call this at the start of commands that require authentication.
 */
export function requireApiKey(): void {
  if (!getApiKey()) {
    printError("No API key configured. Run: nodes-cli config login");
    process.exit(1);
  }
}

/**
 * Format a node as a select choice for pickers.
 *
 * @param node - The node to format
 * @param showStatus - Whether to show published/draft status (default: true)
 * @returns Formatted choice object for select()
 */
export function formatNodeChoice(
  node: NodeInfo,
  showStatus = true,
): { name: string; message: string; value: string } {
  const statusBadge = showStatus
    ? node.isPublished
      ? chalk.green(" ● Published")
      : chalk.yellow(" ○ Draft")
    : "";

  return {
    name: node.uuid,
    message: `${node.title} ${chalk.dim(`(${node.uuid.slice(0, 8)}...)`)}${statusBadge}`,
    value: node.uuid,
  };
}

/**
 * Resolve a node UUID from either a partial UUID or interactive picker.
 *
 * This consolidates the common pattern of:
 * 1. If no UUID provided, show a picker of all nodes
 * 2. If partial UUID provided, find matching nodes
 * 3. If multiple matches, show a picker to disambiguate
 *
 * @param nodeArg - Optional node UUID or partial UUID
 * @param options - Configuration options
 * @returns The resolved full UUID, or "__new__" if user chose to create
 * @throws Exits process if no nodes found or no match
 */
export async function resolveNodeUuid(
  nodeArg: string | undefined,
  options: ResolveNodeOptions = {},
): Promise<string> {
  const {
    selectMessage = "Select a node:",
    allowCreate = false,
    noNodesMessage = "No nodes found. Create one first with: nodes-cli push --new",
    searchByTitle = false,
  } = options;

  let targetUuid = nodeArg;

  if (!targetUuid) {
    // No UUID provided - show picker of all nodes
    const spinner = createSpinner("Fetching your nodes...");
    spinner.start();

    const { nodes } = await listNodes();
    spinner.stop();

    if (nodes.length === 0 && !allowCreate) {
      printError(noNodesMessage);
      process.exit(1);
    }

    const choices = nodes.map((node) => formatNodeChoice(node));

    if (allowCreate) {
      choices.unshift({
        name: "__new__",
        message: chalk.cyan("+ Create new node"),
        value: "__new__",
      });
    }

    if (choices.length === 0) {
      printError(noNodesMessage);
      process.exit(1);
    }

    targetUuid = await select({
      message: selectMessage,
      choices,
    });
  } else {
    // Partial UUID or title provided - find matching nodes
    const spinner = createSpinner("Finding node...");
    spinner.start();

    const { nodes } = await listNodes();
    const searchTerm = targetUuid.toLowerCase();

    // Match by UUID (exact, prefix, or contains)
    let matches = nodes.filter(
      (n) =>
        n.uuid === targetUuid ||
        n.uuid.startsWith(targetUuid!) ||
        n.uuid.includes(targetUuid!),
    );

    // If no UUID matches and searchByTitle is enabled, also search by title
    if (matches.length === 0 && searchByTitle) {
      matches = nodes.filter(
        (n) => n.title.toLowerCase().includes(searchTerm),
      );
    }

    spinner.stop();

    if (matches.length === 0) {
      let searchType = "UUID";
      if (searchByTitle) {
        searchType = "UUID or title";
      }
      printError(`No node found matching ${searchType}: ${targetUuid}`);
      process.exit(1);
    } else if (matches.length === 1) {
      targetUuid = matches[0].uuid;
    } else {
      // Multiple matches - show picker to disambiguate
      const choices = matches.map((node) => formatNodeChoice(node, false));

      targetUuid = await select({
        message: "Multiple nodes match. Select one:",
        choices,
      });
    }
  }

  return targetUuid;
}

/**
 * Options for private key prompt
 */
interface PrivateKeyPromptOptions {
  /** Whether to save the key after prompting (default: false) */
  saveKey?: boolean;
  /** Whether to show saved key info before prompting (default: true) */
  showSavedKeyInfo?: boolean;
  /** Custom message for the prompt */
  message?: string;
}

/**
 * Get or prompt for a private key.
 *
 * This consolidates the common pattern of:
 * 1. Check if private key is already saved
 * 2. If not (or forcePrompt), prompt user for key with validation
 * 3. Optionally save the key for future use
 *
 * @param forcePrompt - If true, always prompt even if key is saved
 * @param options - Configuration options
 * @returns The private key (normalized, without 0x prefix)
 */
export async function getOrPromptPrivateKey(
  forcePrompt = false,
  options: PrivateKeyPromptOptions = {},
): Promise<string> {
  const {
    saveKey = false,
    showSavedKeyInfo = true,
    message = "Enter your Ethereum private key:",
  } = options;

  let privateKey: string | undefined;
  if (forcePrompt) {
    privateKey = undefined;
  } else {
    privateKey = getPrivateKey();
  }

  if (!privateKey) {
    console.log(
      chalk.dim("\nPublishing requires an Ethereum private key to sign the transaction.\n"),
    );

    privateKey = await password({
      message,
      validate: validatePrivateKey,
    });

    // Normalize the key (strip 0x prefix if present)
    privateKey = normalizePrivateKey(privateKey);

    if (saveKey) {
      setPrivateKey(privateKey);
      console.log(chalk.green("✓ Private key saved for future use"));
    }
  } else if (showSavedKeyInfo) {
    console.log(
      chalk.dim(`\nUsing saved private key: ${maskString(privateKey)}`),
    );
  }

  return privateKey;
}

/**
 * Options for creating a node interactively
 */
interface CreateNodeOptions {
  /** Default title to suggest */
  defaultTitle?: string;
  /** Whether this is a dry run (just log what would happen) */
  dryRun?: boolean;
}

/**
 * Result from creating a node
 */
interface CreateNodeResult {
  uuid: string;
  title: string;
}

/**
 * Create a new node interactively with title prompt.
 *
 * @param options - Configuration options
 * @returns The created node info, or null if dry run
 */
export async function createNodeInteractive(
  options: CreateNodeOptions = {},
): Promise<CreateNodeResult | null> {
  const { defaultTitle = "Untitled Node", dryRun = false } = options;

  const title = await input({
    message: `Enter a title for the new node (max ${MAX_TITLE_LENGTH} chars):`,
    default: defaultTitle,
    validate: (value: string) => {
      if (!value || value.trim().length === 0) {
        return "Title cannot be empty";
      }
      if (value.length > MAX_TITLE_LENGTH) {
        return `Title must be ${MAX_TITLE_LENGTH} characters or less (currently ${value.length})`;
      }
      return true;
    },
  });

  if (dryRun) {
    console.log(chalk.dim(`Would create new node: "${title}"`));
    return null;
  }

  const spinner = createSpinner("Creating new node...");
  spinner.start();

  try {
    const { node } = await createDraftNode({
      title,
      defaultLicense: "CC-BY",
      researchFields: [],
    });
    spinner.succeed(`Created node: ${chalk.cyan(title)}`);
    printNodeInfo({
      uuid: node.uuid,
      title: node.title,
      isPublished: false,
    });
    return { uuid: node.uuid, title: node.title };
  } catch (err) {
    spinner.fail("Failed to create node");
    throw err;
  }
}

