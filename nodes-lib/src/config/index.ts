import { getResources } from "@desci-labs/desci-codex-lib";
import { CHAIN_CONFIGS, ChainConfig } from "./chain.js";

export type NodesEnv =
  | "local"
  | "dev"
  | "staging"
  | "prod";

export type NodesLibConfig = {
  apiUrl: string,
  apiKey?: string,
  ceramicNodeUrl: string,
  chainConfig: ChainConfig,
};

export const NODESLIB_CONFIGS = {
  local: {
    apiUrl: "http://localhost:5420",
    apiKey: undefined,
    ceramicNodeUrl: "http://localhost:7007",
    chainConfig: CHAIN_CONFIGS.local,
  },
  dev: {
    apiUrl: "https://nodes-api-dev.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-dev.desci.com",
    chainConfig: CHAIN_CONFIGS.dev,
  },
  staging: {
    apiUrl: "https://nodes-api-staging.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-prod.desci.com",
    chainConfig: CHAIN_CONFIGS.prod, // also using prod contracts
  },
  prod: {
    apiUrl: "https://nodes-api.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-prod.desci.com",
    chainConfig: CHAIN_CONFIGS.prod,
  },
} as const satisfies { [Env in NodesEnv ]: NodesLibConfig };

// Default config to dev environment
let config: NodesLibConfig = NODESLIB_CONFIGS.dev;
console.log(`[nodes-lib::config] initialising with nodes-dev config. Use setConfig and setApiKey to change this: \n${JSON.stringify(NODESLIB_CONFIGS.dev, undefined, 2)}`);
console.log("[nodes-lib::config] config.apiKey is unset; non-public API requests WILL fail unless running in browser with auth cookies!")

/**
 * Set API key in config. Note that it needs to be created in the correct environment:
 * if apiUrl is `nodes-api-dev.desci.com`, generate the API key at
 * `https://nodes-dev.desci.com`.
*/
export const setApiKey = (apiKey: string) => {
  console.log(`[nodes-lib::config] setting new apiKey: \n${apiKey.slice(0, 5) + "..."}`);
  config.apiKey = apiKey;
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
    undefined, 2
  );
  console.log(`[nodes-lib::config] setting new config: \n${confWithRedactedKey}`);
  if (!config.apiKey) {
    console.log("[nodes-lib::config] config.apiKey is unset; non-public API requests WILL fail unless running in browser with auth cookies!")
  };

  config = newConfig;
};

/**
 * Get the current config. Note that apiKey may be undefined, something that is
 * masked by the type to allow browser auth cookie override.
*/
export const getNodesLibInternalConfig = () => {
  return config as Required<NodesLibConfig>;
};

export { getResources };
