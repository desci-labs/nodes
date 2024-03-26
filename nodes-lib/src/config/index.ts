import { CHAIN_CONFIGS, ChainConfig } from "./chain.js";

export type NodesEnv =
  | "local"
  | "dev"
  | "prod";

export type Config = {
  apiUrl: string,
  apiKey?: string,
  ceramicNodeUrl: string,
  chainConfig: ChainConfig,
};

export const CONFIGS = {
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
  prod: {
    apiUrl: "https://nodes-api.desci.com",
    apiKey: undefined,
    ceramicNodeUrl: "https://ceramic-prod.desci.com",
    chainConfig: CHAIN_CONFIGS.prod,
  },
} as const satisfies { [Env in NodesEnv]: Config };

// Default config to dev environment
let config: Config = CONFIGS.dev;
console.log(`[nodes-lib::config] initialising with nodes-dev config. Use setConfig and setApiKey to change this: \n${JSON.stringify(CONFIGS.dev, undefined, 2)}`);

export const setApiKey = (apiKey: string) => {
  config.apiKey = apiKey;
};
export const setConfig = (newConfig: Config): void => {
  config = newConfig;
};
export const getConfig = () => {
  if (!config.apiKey) {
    console.log("[nodes-lib::config] config.apiKey is unset; non-public API requests will fail!")
    throw new Error("Configuration error; no apiKey set.");
  };
  return config as Required<Config>;
};
