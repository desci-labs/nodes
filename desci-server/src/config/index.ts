import { contracts } from '@desci-labs/desci-contracts';
import 'dotenv/config';

export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev'
    ? `http://host.docker.internal:8089/ipfs`
    : process.env.NODE_ENV === 'test'
      ? 'http://host.docker.internal:8091/ipfs'
      : 'https://ipfs.desci.com/ipfs';

export const MEDIA_SERVER_API_URL = process.env.NODES_MEDIA_SERVER_URL;
export const MEDIA_SERVER_API_KEY = process.env.MEDIA_SECRET_KEY;
export const SERVER_URL = process.env.SERVER_URL;

const CERAMIC_API_URLS = {
  local: 'http://host.docker.internal:7007',
  dev: 'https://ceramic-dev.desci.com',
  prod: 'https://ceramic-prod.desci.com',
} as const;

const OPTIMISM_RPC_URLS = {
  local: 'http://host.docker.internal:8545',
  opSepolia: 'https://reverse-proxy-dev.desci.com/rpc_opt_sepolia',
  opMainnet: 'https://reverse-proxy-prod.desci.com/rpc_opt_mainnet',
} as const;

/** Not secret: pre-seeded ganache account for local dev */
export const GANACHE_PKEY = 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

/** Manually set in this module since the envvar needs to support OG ethereum during migration */
export let OPTIMISM_RPC_URL: string;
export let ALIAS_REGISTRY_ADDRESS: string;
export let CERAMIC_API_URL: string;

export const serverIsLocal = SERVER_URL.includes('localhost') || SERVER_URL.includes('host.docker.internal');
const serverIsDev = SERVER_URL.includes('dev');
const serverIsProdOrStaging = process.env.NODE_ENV === 'production' || SERVER_URL.includes('staging');

if (serverIsLocal) {
  ALIAS_REGISTRY_ADDRESS = contracts.localDpidAliasInfo.proxies.at(0).address;
  CERAMIC_API_URL = CERAMIC_API_URLS.local;
  OPTIMISM_RPC_URL = OPTIMISM_RPC_URLS.local;
} else if (serverIsDev) {
  ALIAS_REGISTRY_ADDRESS = contracts.devDpidAliasInfo.proxies.at(0).address;
  CERAMIC_API_URL = CERAMIC_API_URLS.dev;
  OPTIMISM_RPC_URL = OPTIMISM_RPC_URLS.opSepolia;
} else if (serverIsProdOrStaging) {
  ALIAS_REGISTRY_ADDRESS = contracts.prodDpidAliasInfo.proxies.at(0).address;
  CERAMIC_API_URL = CERAMIC_API_URLS.prod;
  OPTIMISM_RPC_URL = OPTIMISM_RPC_URLS.opSepolia;
} else {
  console.error('Cannot derive configuration due to ambiguous environment');
  throw new Error('Ambiguous environment');
};
