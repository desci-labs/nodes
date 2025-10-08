import {
  CHAIN_CONFIGS,
  ChainConfig,
  LEGACY_CHAIN_CONFIGS,
  LegacyChainConfig,
} from "./chain.js";

export type NodesEnv = "local" | "dev" | "staging" | "prod";

export { CHAIN_CONFIGS, ChainConfig, LEGACY_CHAIN_CONFIGS, LegacyChainConfig };

export type NodesLibConfig = {
  apiUrl: string;
  apiKey?: string;
  ceramicNodeUrl: string;
  legacyChainConfig: LegacyChainConfig;
  ceramicOneRpcUrl?: string;
  ceramicOneFlightUrl?: string;
  chainConfig: ChainConfig;
};

export const NODESLIB_CONFIGS = {
  local: {
    apiUrl: process.env.NODES_API_URL || "http://localhost:5420",
    apiKey: undefined,
    ceramicNodeUrl: "http://localhost:7007",
    legacyChainConfig: LEGACY_CHAIN_CONFIGS.local,
    ceramicOneRpcUrl:
      process.env.CERAMIC_ONE_RPC_URL || "http://localhost:5101",
    ceramicOneFlightUrl:
      process.env.CERAMIC_ONE_FLIGHT_URL || "http://localhost:5102",
    chainConfig: CHAIN_CONFIGS.local,
  },
  dev: {
    apiUrl: "https://nodes-api-dev.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-dev.desci.com",
    legacyChainConfig: LEGACY_CHAIN_CONFIGS.dev,
    ceramicOneRpcUrl: "https://ceramic-one-dev-rpc.desci.com",
    ceramicOneFlightUrl: "http://ceramic-one-dev.desci.com:5102",
    chainConfig: CHAIN_CONFIGS.dev,
  },
  staging: {
    apiUrl: "https://nodes-api-staging.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-prod.desci.com",
    legacyChainConfig: LEGACY_CHAIN_CONFIGS.prod, // also using the prod contracts
    ceramicOneRpcUrl: "https://ceramic-one-prod-rpc.desci.com",
    ceramicOneFlightUrl: "http://ceramic-one-prod.desci.com:5102",
    chainConfig: CHAIN_CONFIGS.prod, // also using prod contracts
  },
  prod: {
    apiUrl: "https://nodes-api.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-prod.desci.com",
    legacyChainConfig: LEGACY_CHAIN_CONFIGS.prod,
    ceramicOneRpcUrl: "https://ceramic-one-prod-rpc.desci.com",
    ceramicOneFlightUrl: "http://ceramic-one-prod.desci.com:5102",
    chainConfig: CHAIN_CONFIGS.prod,
  },
} as const satisfies { [Env in NodesEnv]: NodesLibConfig };

// Config storage - starts undefined
let config: NodesLibConfig | undefined;
let hasLoggedInitialization = false;

/**
 * Initialize config with default if not already set
 */
const ensureConfig = (): NodesLibConfig => {
  if (!config) {
    config = NODESLIB_CONFIGS.dev;
    if (!hasLoggedInitialization) {
      hasLoggedInitialization = true;
      console.log(
        `[nodes-lib::config] initialising with nodes-dev config. Use setConfig and setApiKey to change this: \n${JSON.stringify(NODESLIB_CONFIGS.dev, undefined, 2)}`,
      );
      console.log(
        "[nodes-lib::config] config.apiKey is unset; non-public API requests WILL fail unless running in browser with auth cookies!",
      );
    }
  }
  return config;
};

/**
 * Set API key in config. Note that it needs to be created in the correct environment:
 * if apiUrl is `nodes-api-dev.desci.com`, generate the API key at
 * `https://nodes-dev.desci.com`.
 */
export const setApiKey = (apiKey: string) => {
  console.log(
    `[nodes-lib::config] setting new apiKey: \n${apiKey.slice(0, 5) + "..."}`,
  );
  ensureConfig().apiKey = apiKey;
};

/**
 * Set a new configuration. You likely want a preset from the `CONFIGS` object.
 */
export const setNodesLibConfig = (newConfig: NodesLibConfig): void => {
  const confWithRedactedKey = JSON.stringify(
    {
      ...newConfig,
      apiKey: newConfig.apiKey
        ? newConfig.apiKey?.slice(0, 5) + "..."
        : "[unset]",
    },
    undefined,
    2,
  );
  console.log(
    `[nodes-lib::config] setting new config: \n${confWithRedactedKey}`,
  );
  if (!newConfig.apiKey) {
    console.log(
      "[nodes-lib::config] config.apiKey is unset; non-public API requests WILL fail unless running in browser with auth cookies!",
    );
  }

  config = newConfig;
  hasLoggedInitialization = true; // Prevent duplicate init logs
};

/**
 * Get the current config. Note that apiKey may be undefined, something that is
 * masked by the type to allow browser auth cookie override.
 */
export const getNodesLibInternalConfig = () => {
  return ensureConfig() as Required<NodesLibConfig>;
};
