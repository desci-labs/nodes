#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { printBanner, printError } from "./ui.js";
import { getApiKey, getEnvironment, getEnvConfig, initializeNodesLib, WEB_URLS } from "./config.js";
import { getErrorMessage } from "./helpers.js";
import {
  createPushCommand,
  createPullCommand,
  createConfigCommand,
  createListCommand,
  createPublishCommand,
} from "./commands/index.js";

// Initialize nodes-lib with stored configuration
initializeNodesLib();

// Show beta warning on first use
console.log(chalk.yellow.bold("\n⚠️  This is beta software. Use with caution for production data.\n"));

const program = new Command();

program
  .name("nodes-cli")
  .description(
    chalk.dim(
      "DeSci Nodes CLI - Push, pull, and publish research data to decentralized nodes",
    ),
  )
  .version("0.1.0")
  .hook("preAction", (thisCommand) => {
    // Show banner for main commands (not for help/version)
    const commandName = thisCommand.args[0];
    if (
      commandName &&
      !["help", "version", "-h", "--help", "-v", "--version"].includes(
        commandName,
      )
    ) {
      // Show minimal header
      const env = getEnvironment();
      const hasKey = !!getApiKey();
      let keyIndicator = chalk.red("○");
      if (hasKey) {
        keyIndicator = chalk.green("●");
      }
      console.log(
        chalk.dim(`\n[${env}] `) + keyIndicator + chalk.dim(" nodes-cli"),
      );
    }
  });

// Add commands
program.addCommand(createPushCommand());
program.addCommand(createPullCommand());
program.addCommand(createListCommand());
program.addCommand(createConfigCommand());
program.addCommand(createPublishCommand());

// Add init alias for config login
program
  .command("init")
  .description("Initialize CLI with your credentials (alias for config login)")
  .action(async () => {
    printBanner();
    const configCmd = createConfigCommand();
    const loginCmd = configCmd.commands.find((c) => c.name() === "login");
    if (loginCmd) {
      await loginCmd.parseAsync([], { from: "user" });
    }
  });

// Add open command to view node in browser
program
  .command("open")
  .description("Open a node in the web browser")
  .argument("<node>", "Node UUID or partial UUID")
  .action(async (nodeArg: string) => {
    const { webUrl } = getEnvConfig();

    // Try to find full UUID
    const { listNodes } = await import("@desci-labs/nodes-lib/node");
    const apiKey = getApiKey();

    if (apiKey) {
      try {
        const { nodes } = await listNodes();
        const match = nodes.find(
          (n) => n.uuid === nodeArg || n.uuid.startsWith(nodeArg),
        );
        if (match) {
          const url = `${webUrl}/node/${match.uuid}`;
          console.log(chalk.dim(`\nOpening: ${url}\n`));

          const open = (await import("open")).default;
          await open(url);
          return;
        }
      } catch {
        // Fall through to use provided arg
      }
    }

    const url = `${webUrl}/node/${nodeArg}`;
    console.log(chalk.dim(`\nOpening: ${url}\n`));

    const open = (await import("open")).default;
    await open(url);
  });

// Add status command
program
  .command("status")
  .description("Show current CLI status and configuration")
  .action(async () => {
    printBanner();

    const env = getEnvironment();
    const apiKey = getApiKey();
    const envConfig = getEnvConfig();

    console.log(chalk.bold("Status\n"));
    console.log(`  Environment: ${chalk.yellow(env)}`);
    let apiKeyStatus = chalk.red("✗ not set");
    if (apiKey) {
      apiKeyStatus = chalk.green("✓ configured");
    }
    console.log(`  API Key:     ${apiKeyStatus}`);
    console.log(`  API URL:     ${chalk.dim(envConfig.apiUrl)}`);
    console.log(`  Web URL:     ${chalk.dim(envConfig.webUrl)}`);

    if (apiKey) {
      console.log(chalk.dim("\nTesting connection..."));

      try {
        const { listNodes } = await import("@desci-labs/nodes-lib/node");
        const { nodes } = await listNodes();
        console.log(chalk.green(`✓ Connected - ${nodes.length} nodes found`));
      } catch (err) {
        console.log(chalk.red("✗ Connection failed"));
        console.log(chalk.dim(`  ${getErrorMessage(err)}`));
      }
    } else {
      console.log(chalk.dim("\nRun `nodes-cli init` to set up your credentials"));
    }

    console.log();
  });

// Add sync command - interactive push with --clean by default
program
  .command("sync")
  .description("Sync a local folder with a node (interactive, removes deleted files)")
  .argument("<path>", "Local folder path")
  .argument("[node]", "Node UUID (optional - will show picker if not provided)")
  .option("--dry-run", "Show what would be synced without making changes")
  .option("--no-clean", "Don't remove remote files that don't exist locally")
  .option("--prepublish", "Prepare node for publishing after sync")
  .action(async (path: string, node: string | undefined, options) => {
    // Build args for push command
    const args = [path];
    
    if (node) {
      args.push("--node", node);
    }
    
    // Sync uses --clean by default (unless --no-clean is passed)
    if (options.clean !== false) {
      args.push("--clean");
    }
    
    if (options.dryRun) {
      args.push("--dry-run");
    }
    
    if (options.prepublish) {
      args.push("--prepublish");
    }

    // Run push with the args
    const pushCmd = createPushCommand();
    await pushCmd.parseAsync(args, { from: "user" });
  });

// Error handling
program.exitOverride((err) => {
  if (err.code === "commander.help") {
    printBanner();
  }
});

// Parse arguments
program.parseAsync(process.argv).catch((err) => {
  printError(err.message);
  process.exit(1);
});

