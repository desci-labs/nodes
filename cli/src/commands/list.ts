import { Command } from "commander";
import chalk from "chalk";
import {
  createSpinner,
  printError,
  printTable,
  truncateUuid,
  formatBytes,
  symbols,
} from "../ui.js";
import { getEnvConfig } from "../config.js";
import { requireApiKey } from "../helpers.js";
import {
  listNodes,
  retrieveDraftFileTree,
} from "@desci-labs/nodes-lib/node";
import type { DriveObject } from "@desci-labs/desci-models";

function formatDate(dateString: string | undefined): string {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "N/A";
  
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  return date.toLocaleDateString();
}

function printTree(items: DriveObject[], prefix = ""): void {
  items.forEach((item, index) => {
    const isLastItem = index === items.length - 1;

    let connector = "├── ";
    if (isLastItem) {
      connector = "└── ";
    }

    let icon = chalk.dim("📄");
    if (item.type === "dir") {
      icon = chalk.blue("📁");
    }

    let size = "";
    if (item.size) {
      size = chalk.dim(` (${formatBytes(item.size)})`);
    }

    console.log(`${prefix}${connector}${icon} ${item.name}${size}`);

    if (item.type === "dir" && item.contains) {
      let newPrefix = prefix + "│   ";
      if (isLastItem) {
        newPrefix = prefix + "    ";
      }
      printTree(item.contains, newPrefix);
    }
  });
}

export function createListCommand(): Command {
  const cmd = new Command("list")
    .alias("ls")
    .description("List nodes or files")
    .argument("[node]", "Node UUID to list files from (optional)")
    .option("-a, --all", "Show all details")
    .option("-t, --tree", "Show file tree for node")
    .action(async (nodeArg: string | undefined, options) => {
      try {
        // Check API key
        requireApiKey();

        if (nodeArg) {
          // List files in a specific node
          await listNodeFiles(nodeArg, options);
        } else {
          // List all nodes
          await listAllNodes(options);
        }
      } catch (error: unknown) {
        let message = "Unknown error";
        if (error instanceof Error) {
          message = error.message;
        }
        printError(`List failed: ${message}`);
        process.exit(1);
      }
    });

  return cmd;
}

async function listAllNodes(options: { all?: boolean }): Promise<void> {
  const spinner = createSpinner("Fetching nodes...");
  spinner.start();

  try {
    const { nodes } = await listNodes();
    spinner.stop();

    if (nodes.length === 0) {
      console.log(chalk.yellow("\nNo nodes found."));
      console.log(chalk.dim("Create one with: nodes-cli push --new <folder>\n"));
      return;
    }

    console.log(
      `\n${symbols.node} ${chalk.bold("Your Nodes")} (${nodes.length})\n`,
    );

    const { webUrl } = getEnvConfig();

    if (options.all) {
      // Detailed view
      for (const node of nodes) {
        const status = node.isPublished
          ? chalk.green("● Published")
          : chalk.yellow("○ Draft");

        console.log(chalk.bold(node.title));
        console.log(chalk.dim("─".repeat(40)));
        console.log(`  UUID:    ${chalk.cyan(node.uuid)}`);
        console.log(`  Status:  ${status}`);
        console.log(`  Updated: ${formatDate(node.updatedAt)}`);
        console.log(`  CID:     ${chalk.dim(node.cid || "N/A")}`);
        console.log(`  URL:     ${chalk.dim(`${webUrl}/node/${node.uuid}`)}`);
        console.log();
      }
    } else {
      // Table view
      const headers = ["Title", "UUID", "Status", "Updated"];
      const rows = nodes.map((node) => {
        let title = node.title;
        if (title.length > 30) {
          title = title.slice(0, 27) + "...";
        }

        let status = chalk.yellow("Draft");
        if (node.isPublished) {
          status = chalk.green("Published");
        }

        return [
          title,
          truncateUuid(node.uuid, 12),
          status,
          formatDate(node.updatedAt),
        ];
      });

      printTable(headers, rows);
    }
  } catch (err) {
    spinner.fail("Failed to fetch nodes");
    throw err;
  }
}

async function listNodeFiles(
  nodeArg: string,
  options: { tree?: boolean },
): Promise<void> {
  // Find matching node
  const spinner = createSpinner("Finding node...");
  spinner.start();

  const { nodes } = await listNodes();
  const matches = nodes.filter(
    (n) =>
      n.uuid === nodeArg ||
      n.uuid.startsWith(nodeArg) ||
      n.uuid.includes(nodeArg),
  );

  if (matches.length === 0) {
    spinner.fail(`No node found matching: ${nodeArg}`);
    process.exit(1);
  }

  const node = matches[0];
  spinner.text = `Loading files from: ${node.title}`;

  try {
    const { tree } = await retrieveDraftFileTree(node.uuid);
    spinner.succeed(`${node.title}`);

    if (tree.length === 0) {
      console.log(chalk.yellow("\nNo files in this node."));
      console.log(
        chalk.dim(
          "Add files with: nodes-cli push <folder> --node " +
            node.uuid.slice(0, 8) +
            "\n",
        ),
      );
      return;
    }

    console.log();

    if (options.tree) {
      // Tree view
      console.log(chalk.blue("📁") + " " + chalk.bold("root"));
      printTree(tree, "");
    } else {
      // Simple list
      const listFiles = (items: DriveObject[], path = ""): void => {
        for (const item of items) {
          let fullPath = item.name;
          if (path) {
            fullPath = `${path}/${item.name}`;
          }
          if (item.type === "file") {
            const size = item.size
              ? chalk.dim(` (${formatBytes(item.size)})`)
              : "";
            console.log(`  ${symbols.arrowRight} ${fullPath}${size}`);
          } else if (item.contains) {
            listFiles(item.contains, fullPath);
          }
        }
      };
      listFiles(tree);
    }

    console.log();
  } catch {
    spinner.fail("Failed to load file tree");
    process.exit(1);
  }
}

