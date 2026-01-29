import { Command } from "commander";
import chalk from "chalk";
import { confirm } from "../prompts.js";
import {
  createSpinner,
  printSuccess,
  printError,
  printNodeInfo,
  symbols,
} from "../ui.js";
import { getEnvConfig, getEnvironment } from "../config.js";
import { requireApiKey, resolveNodeUuid, getOrPromptPrivateKey, getErrorMessage } from "../helpers.js";
import {
  getDraftNode,
  publishNode,
  signerFromPkey,
} from "@desci-labs/nodes-lib/node";

export function createPublishCommand(): Command {
  return new Command("publish")
    .description("Publish a node to Codex (requires signing)")
    .argument("[node]", "Node UUID, partial UUID, or title search term")
    .option("-k, --private-key", "Prompt for private key (won't be saved)")
    .option("--save-key", "Save the private key for future use")
    .option("--mint-doi", "Request DOI minting during publish")
    .action(async (nodeArg: string | undefined, options) => {
      try {
        // Check API key
        requireApiKey();

        // Resolve node UUID (picker or partial match, also search by title)
        const targetUuid = await resolveNodeUuid(nodeArg, {
          selectMessage: "Select a node to publish:",
          searchByTitle: true,
        });

        // Get node info
        const nodeSpinner = createSpinner("Loading node...");
        nodeSpinner.start();

        let node;
        try {
          node = await getDraftNode(targetUuid);
          nodeSpinner.succeed(`Found node: ${chalk.cyan(node.title)}`);
        } catch {
          nodeSpinner.fail(`Failed to load node: ${targetUuid}`);
          process.exit(1);
        }

        printNodeInfo({
          uuid: node.uuid,
          title: node.title,
          isPublished: node.ceramicStream !== undefined,
          cid: node.cid,
          dpidAlias: node.dpidAlias,
        });

        // Get private key (prompt if --private-key flag or not saved)
        const privateKey = await getOrPromptPrivateKey(options.privateKey, {
          saveKey: options.saveKey,
          message: "Enter your private key:",
        });

        // Confirm publish
        const isUpdate = node.ceramicStream !== undefined;
        let actionText = "publish";
        if (isUpdate) {
          actionText = "publish a new version of";
        }
        
        const confirmed = await confirm({
          message: `Ready to ${actionText} "${node.title}"?`,
          default: true,
        });

        if (!confirmed) {
          console.log(chalk.dim("\nPublish cancelled."));
          process.exit(0);
        }

        // Create signer from private key
        const signer = signerFromPkey(privateKey);
        const signerAddress = await signer.getAddress();
        console.log(
          chalk.dim(`\nSigning as: ${signerAddress}`),
        );

        // Perform publish - show which Ceramic mode is being used
        const env = getEnvironment();
        let ceramicMode = "Ceramic One";
        if (env === "prod") {
          ceramicMode = "Legacy Ceramic";
        }
        console.log(chalk.dim(`Using: ${ceramicMode}`));
        
        console.log();
        const publishSpinner = createSpinner("Publishing to Codex...");
        publishSpinner.start();

        const startTime = Date.now();

        try {
          const result = await publishNode(targetUuid, signer, options.mintDoi);
          
          const duration = Date.now() - startTime;
          publishSpinner.succeed(
            `Published in ${Math.round(duration / 1000)}s`,
          );

          console.log();
          console.log(chalk.bold("Publication Details:"));
          console.log(chalk.dim("─".repeat(40)));
          console.log(`  ${chalk.cyan("dPID:")}      ${chalk.bold(result.dpid)}`);
          console.log(`  ${chalk.cyan("Stream ID:")} ${chalk.dim(result.ceramicIDs?.streamID || "N/A")}`);
          console.log(`  ${chalk.cyan("Commit ID:")} ${chalk.dim(result.ceramicIDs?.commitID || "N/A")}`);
          console.log(`  ${chalk.cyan("Manifest:")}  ${chalk.dim(result.updatedManifestCid)}`);
          console.log(chalk.dim("─".repeat(40)));

          let successMsg = "Node published successfully!";
          if (isUpdate) {
            successMsg = "New version published successfully!";
          }
          printSuccess(successMsg);

          const { webUrl } = getEnvConfig();
          console.log(chalk.dim("View your node:"));
          console.log(chalk.cyan(`  ${webUrl}/node/${targetUuid}`));
          console.log();
          
          if (result.dpid) {
            console.log(chalk.dim("Resolve via dPID:"));
            console.log(chalk.cyan(`  https://beta.dpid.org/${result.dpid}`));
            console.log();
          }
        } catch (err) {
          publishSpinner.fail("Publish failed");
          throw err;
        }
      } catch (error: unknown) {
        printError(`Publish failed: ${getErrorMessage(error)}`);
        
        // Show more detailed error info for debugging
        if (error instanceof Error && error.cause) {
          console.log(chalk.dim(`Cause: ${(error.cause as Error).message || error.cause}`));
        }
        
        process.exit(1);
      }
    });
}

