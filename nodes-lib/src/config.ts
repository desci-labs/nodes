import "dotenv/config";

const requiredConfigVars = [
  "RO_CONTRACT_ADDRESS",
  "DPID_CONTRACT_ADDRESS",
  "ETHEREUM_RPC_URL",
  "NODES_API_KEY",
  "PUBLISH_PKEY",
  "NODES_API_URL",
  "CERAMIC_NODE_URL",
];

const unsetVars = requiredConfigVars
  .map(key => ({key, val: process.env[key]}))
  .filter(({val}) => !val)
  .map(({key}) => key);

if (unsetVars.length > 0) {
  console.log(`[nodes-lib] Required environment variables unset: ${unsetVars}`);
  throw new Error("Incomplete configuration");
};

export const RO_CONTRACT_ADDRESS = process.env.RO_CONTRACT_ADDRESS!;
export const DPID_CONTRACT_ADDRESS = process.env.DPID_CONTRACT_ADDRESS!;
export const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL!;
export const NODES_API_KEY = process.env.NODES_API_KEY!;
export const PUBLISH_PKEY = process.env.PUBLISH_PKEY!;
export const NODES_API_URL = process.env.NODES_API_URL!;
export const CERAMIC_NODE_URL = process.env.CERAMIC_NODE_URL!;
