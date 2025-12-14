import { Command } from "commander";
import chalk from "chalk";
import { select, confirm, password } from "../prompts.js";
import { createSpinner, printSuccess, printError, printNodeInfo, maskString, } from "../ui.js";
import { getApiKey, getEnvConfig, getPrivateKey, setPrivateKey } from "../config.js";
import { getDraftNode, listNodes, publishNode, signerFromPkey, } from "@desci-labs/nodes-lib/node";
export function createPublishCommand() {
    return new Command("publish")
        .description("Publish a node to Codex (requires signing)")
        .argument("[node]", "Node UUID or partial UUID")
        .option("-k, --private-key", "Prompt for private key (won't be saved)")
        .option("--save-key", "Save the private key for future use")
        .option("--mint-doi", "Request DOI minting during publish")
        .action(async (nodeArg, options) => {
        try {
            // Check API key
            if (!getApiKey()) {
                printError("No API key configured. Run: nodes-cli config login");
                process.exit(1);
            }
            let targetUuid = nodeArg;
            // If no node specified, show picker
            if (!targetUuid) {
                const spinner = createSpinner("Fetching your nodes...");
                spinner.start();
                const { nodes } = await listNodes();
                spinner.stop();
                if (nodes.length === 0) {
                    printError("No nodes found. Create one first with: nodes-cli push --new");
                    process.exit(1);
                }
                const choices = nodes.map((node) => ({
                    name: node.uuid,
                    message: `${node.title} ${chalk.dim(`(${node.uuid.slice(0, 8)}...)`)} ${node.isPublished
                        ? chalk.green("● Published")
                        : chalk.yellow("○ Draft")}`,
                    value: node.uuid,
                }));
                targetUuid = await select({
                    message: "Select a node to publish:",
                    choices,
                });
            }
            else {
                // Handle partial UUID matching
                const spinner = createSpinner("Finding node...");
                spinner.start();
                const { nodes } = await listNodes();
                const matches = nodes.filter((n) => n.uuid === targetUuid ||
                    n.uuid.startsWith(targetUuid) ||
                    n.uuid.includes(targetUuid));
                spinner.stop();
                if (matches.length === 0) {
                    printError(`No node found matching: ${targetUuid}`);
                    process.exit(1);
                }
                else if (matches.length === 1) {
                    targetUuid = matches[0].uuid;
                }
                else {
                    const choices = matches.map((node) => ({
                        name: node.uuid,
                        message: `${node.title} ${chalk.dim(`(${node.uuid.slice(0, 8)}...)`)}`,
                        value: node.uuid,
                    }));
                    targetUuid = await select({
                        message: "Multiple nodes match. Select one:",
                        choices,
                    });
                }
            }
            // Get node info
            const nodeSpinner = createSpinner("Loading node...");
            nodeSpinner.start();
            let node;
            try {
                node = await getDraftNode(targetUuid);
                nodeSpinner.succeed(`Found node: ${chalk.cyan(node.title)}`);
            }
            catch {
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
            // Get private key
            let privateKey = options.privateKey ? undefined : getPrivateKey();
            if (!privateKey) {
                console.log(chalk.dim("\nPublishing requires an Ethereum private key to sign the transaction.\n"));
                privateKey = await password({
                    message: "Enter your private key:",
                    validate: (value) => {
                        const cleaned = value.startsWith("0x") ? value.slice(2) : value;
                        if (!cleaned || cleaned.length < 64) {
                            return "Please enter a valid private key (64 hex characters)";
                        }
                        return true;
                    },
                });
                if (options.saveKey) {
                    setPrivateKey(privateKey);
                    console.log(chalk.green("✓ Private key saved for future use"));
                }
            }
            else {
                console.log(chalk.dim(`\nUsing saved private key: ${maskString(privateKey)}`));
            }
            // Confirm publish
            const isUpdate = node.ceramicStream !== undefined;
            const actionText = isUpdate
                ? "publish a new version of"
                : "publish";
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
            console.log(chalk.dim(`\nSigning as: ${signerAddress}`));
            // Perform publish
            console.log();
            const publishSpinner = createSpinner("Publishing to Codex...");
            publishSpinner.start();
            const startTime = Date.now();
            try {
                const result = await publishNode(targetUuid, signer, options.mintDoi);
                const duration = Date.now() - startTime;
                publishSpinner.succeed(`Published in ${Math.round(duration / 1000)}s`);
                console.log();
                console.log(chalk.bold("Publication Details:"));
                console.log(chalk.dim("─".repeat(40)));
                console.log(`  ${chalk.cyan("dPID:")}      ${chalk.bold(result.dpid)}`);
                console.log(`  ${chalk.cyan("Stream ID:")} ${chalk.dim(result.ceramicIDs?.streamID || "N/A")}`);
                console.log(`  ${chalk.cyan("Commit ID:")} ${chalk.dim(result.ceramicIDs?.commitID || "N/A")}`);
                console.log(`  ${chalk.cyan("Manifest:")}  ${chalk.dim(result.updatedManifestCid)}`);
                console.log(chalk.dim("─".repeat(40)));
                printSuccess(isUpdate
                    ? "New version published successfully!"
                    : "Node published successfully!");
                const { webUrl } = getEnvConfig();
                console.log(chalk.dim("View your node:"));
                console.log(chalk.cyan(`  ${webUrl}/node/${targetUuid}`));
                console.log();
                if (result.dpid) {
                    console.log(chalk.dim("Resolve via dPID:"));
                    console.log(chalk.cyan(`  https://beta.dpid.org/${result.dpid}`));
                    console.log();
                }
            }
            catch (err) {
                publishSpinner.fail("Publish failed");
                throw err;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            printError(`Publish failed: ${message}`);
            // Show more detailed error info for debugging
            if (error instanceof Error && error.cause) {
                console.log(chalk.dim(`Cause: ${error.cause.message || error.cause}`));
            }
            process.exit(1);
        }
    });
}
