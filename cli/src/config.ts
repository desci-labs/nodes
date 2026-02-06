import Conf from "conf";
import chalk from "chalk";
import {
  NODESLIB_CONFIGS,
  setNodesLibConfig,
  setApiKey as setNodesLibApiKey,
  setQuietMode,
  type NodesEnv,
} from "@desci-labs/nodes-lib/node";
import { normalizePrivateKey } from "./prompts.js";

export type Environment = NodesEnv;

export interface CliConfig {
  apiKey?: string;
  privateKey?: string;
  environment: Environment;
  defaultNodeUuid?: string;
}

const schema = {
  apiKey: { type: "string" as const },
  privateKey: { type: "string" as const },
  environment: {
    type: "string" as const,
    default: "dev",
    enum: ["local", "dev", "staging", "prod"],
  },
  defaultNodeUuid: { type: "string" as const },
};

/**
 * CLI configuration store using Conf.
 *
 * SECURITY NOTES:
 * - Config file location: ~/.config/desci-nodes-cli/config.json (Linux/macOS)
 *   or %APPDATA%\desci-nodes-cli\Config\config.json (Windows)
 * - File permissions are set to 0o600 (owner read/write only) for security
 * - For production use with real keys, ensure the config directory and file
 *   have restrictive permissions (chmod 600 on the config file)
 * - The configuration contains sensitive data (API keys, private keys) and
 *   should be treated as confidential
 *
 * RECOMMENDATIONS:
 * - Set file permissions to 0o600 for the config file in production
 * - Consider using environment variables for CI/CD pipelines instead
 * - Never commit the config file to version control
 */
export const config = new Conf<CliConfig>({
  projectName: "desci-nodes-cli",
  schema,
  // Set restrictive file permissions (owner read/write only) for security
  // This helps protect API keys and private keys stored in the config
  configFileMode: 0o600,
});

// Web URLs for each environment
export const WEB_URLS: Record<Environment, string> = {
  local: "http://localhost:3000",
  dev: "https://nodes-dev.desci.com",
  staging: "https://nodes-staging.desci.com",
  prod: "https://nodes.desci.com",
};

// IPFS gateways for each environment
export const IPFS_GATEWAYS: Record<Environment, string> = {
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

export function getApiKey(): string | undefined {
  return config.get("apiKey");
}

export function setApiKey(key: string): void {
  config.set("apiKey", key);
  // Also set in nodes-lib
  setNodesLibApiKey(key);
}

export function getPrivateKey(): string | undefined {
  return config.get("privateKey");
}

/**
 * Stores the private key after normalizing (stripping 0x prefix).
 * The key is stored in the config file with restrictive permissions.
 *
 * @param key - The private key (with or without 0x prefix)
 */
export function setPrivateKey(key: string): void {
  config.set("privateKey", normalizePrivateKey(key));
}

export function clearPrivateKey(): void {
  config.delete("privateKey");
}

/**
 * Get the nodes-lib config for the given environment.
 */
function getNodesLibConfigForEnv(env: Environment) {
  return NODESLIB_CONFIGS[env];
}

export function setEnvironment(env: Environment): void {
  config.set("environment", env);
  setNodesLibConfig(getNodesLibConfigForEnv(env));
}

export function getEnvironment(): Environment {
  return config.get("environment") || "dev";
}

export function clearConfig(): void {
  config.clear();
}

/**
 * Initialize nodes-lib with the stored configuration.
 * Call this at CLI startup.
 */
export function initializeNodesLib(): void {
  // Enable quiet mode to suppress nodes-lib config logging
  setQuietMode(true);
  
  const env = getEnvironment();
  const apiKey = getApiKey();
  
  setNodesLibConfig(getNodesLibConfigForEnv(env));
  if (apiKey) {
    setNodesLibApiKey(apiKey);
  }
}

export function printCurrentConfig(): void {
  const env = getEnvironment();
  const apiKey = getApiKey();
  const privateKey = getPrivateKey();
  const envConfig = getEnvConfig();

  let apiKeyStatus = chalk.red("✗ not set");
  if (apiKey) {
    apiKeyStatus = chalk.green("✓ configured");
  }

  let privateKeyStatus = chalk.dim("not set (optional)");
  if (privateKey) {
    privateKeyStatus = chalk.green("✓ configured");
  }

  console.log(chalk.bold("\n📋 Current Configuration\n"));
  console.log(chalk.dim("─".repeat(40)));
  console.log(`${chalk.cyan("Environment:")}  ${chalk.yellow(env)}`);
  console.log(`${chalk.cyan("API URL:")}      ${envConfig.apiUrl}`);
  console.log(`${chalk.cyan("IPFS Gateway:")} ${envConfig.ipfsGateway}`);
  console.log(`${chalk.cyan("Web URL:")}      ${envConfig.webUrl}`);
  console.log(`${chalk.cyan("API Key:")}      ${apiKeyStatus}`);
  console.log(`${chalk.cyan("Private Key:")} ${privateKeyStatus}`);
  console.log(chalk.dim("─".repeat(40)));
  console.log(chalk.dim(`\nConfig stored at: ${config.path}\n`));
}

