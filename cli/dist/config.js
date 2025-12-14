import Conf from "conf";
import chalk from "chalk";
import { NODESLIB_CONFIGS, setNodesLibConfig, setApiKey as setNodesLibApiKey, setQuietMode, } from "@desci-labs/nodes-lib/node";
const schema = {
    apiKey: { type: "string" },
    privateKey: { type: "string" },
    environment: {
        type: "string",
        default: "dev",
        enum: ["local", "dev", "staging", "prod"],
    },
    defaultNodeUuid: { type: "string" },
};
export const config = new Conf({
    projectName: "desci-nodes-cli",
    schema,
});
// Web URLs for each environment
export const WEB_URLS = {
    local: "http://localhost:3000",
    dev: "https://nodes-dev.desci.com",
    staging: "https://nodes-staging.desci.com",
    prod: "https://nodes.desci.com",
};
// IPFS gateways for each environment
export const IPFS_GATEWAYS = {
    local: "http://localhost:8089/ipfs",
    dev: "https://ipfs.desci.com/ipfs",
    staging: "https://ipfs.desci.com/ipfs",
    prod: "https://ipfs.desci.com/ipfs",
};
export function getEnvConfig() {
    const env = config.get("environment") || "dev";
    const nodesLibConfig = NODESLIB_CONFIGS[env];
    return {
        apiUrl: nodesLibConfig.apiUrl,
        ipfsGateway: IPFS_GATEWAYS[env],
        webUrl: WEB_URLS[env],
    };
}
export function getApiKey() {
    return config.get("apiKey");
}
export function setApiKey(key) {
    config.set("apiKey", key);
    // Also set in nodes-lib
    setNodesLibApiKey(key);
}
export function getPrivateKey() {
    return config.get("privateKey");
}
export function setPrivateKey(key) {
    config.set("privateKey", key);
}
export function clearPrivateKey() {
    config.delete("privateKey");
}
export function setEnvironment(env) {
    config.set("environment", env);
    // Also update nodes-lib config
    setNodesLibConfig(NODESLIB_CONFIGS[env]);
}
export function getEnvironment() {
    return config.get("environment") || "dev";
}
export function clearConfig() {
    config.clear();
}
/**
 * Initialize nodes-lib with the stored configuration.
 * Call this at CLI startup.
 */
export function initializeNodesLib() {
    // Enable quiet mode to suppress nodes-lib config logging
    setQuietMode(true);
    const env = getEnvironment();
    const apiKey = getApiKey();
    setNodesLibConfig(NODESLIB_CONFIGS[env]);
    if (apiKey) {
        setNodesLibApiKey(apiKey);
    }
}
export function printCurrentConfig() {
    const env = getEnvironment();
    const apiKey = getApiKey();
    const privateKey = getPrivateKey();
    const envConfig = getEnvConfig();
    console.log(chalk.bold("\n📋 Current Configuration\n"));
    console.log(chalk.dim("─".repeat(40)));
    console.log(`${chalk.cyan("Environment:")}  ${chalk.yellow(env)}`);
    console.log(`${chalk.cyan("API URL:")}      ${envConfig.apiUrl}`);
    console.log(`${chalk.cyan("IPFS Gateway:")} ${envConfig.ipfsGateway}`);
    console.log(`${chalk.cyan("Web URL:")}      ${envConfig.webUrl}`);
    console.log(`${chalk.cyan("API Key:")}      ${apiKey ? chalk.green("✓ configured") : chalk.red("✗ not set")}`);
    console.log(`${chalk.cyan("Private Key:")} ${privateKey ? chalk.green("✓ configured") : chalk.dim("not set (optional)")}`);
    console.log(chalk.dim("─".repeat(40)));
    console.log(chalk.dim(`\nConfig stored at: ${config.path}\n`));
}
