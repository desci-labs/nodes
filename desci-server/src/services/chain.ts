import { providers, Wallet } from 'ethers';
import { ALIAS_REGISTRY_ADDRESS, GANACHE_PKEY, OPTIMISM_RPC_URL, serverIsLocal } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';
import { DpidAliasRegistry__factory } from '@desci-labs/desci-contracts/dist/typechain-types/index.js';
import { getOrCache } from '../redisClient.js';

const logger = parentLogger.child({
  module: 'Services::Chain',
});

export const getOptimismProvider = async () => {
  const provider = new providers.JsonRpcProvider(OPTIMISM_RPC_URL);
  await provider.ready;
  return provider;
};

export const getHotWalletKey = () => {
  if (serverIsLocal) {
    return GANACHE_PKEY;
  } else if (process.env.HOT_WALLET_KEY) {
    return process.env.HOT_WALLET_KEY;
  } else {
    logger.error({ fn: 'getHotWalletKey' }, 'HOT_WALLET_KEY not set');
    throw new Error('HOT_WALLET_KEY missing');
  }
};

export const getOwnerWalletKey = () => {
  if (serverIsLocal) {
    return GANACHE_PKEY;
  } else if (process.env.REGISTRY_OWNER_PKEY) {
    return process.env.REGISTRY_OWNER_PKEY;
  } else {
    logger.error({ fn: 'getOwnerWalletKey' }, 'REGISTRY_OWNER_PKEY not set');
    throw new Error('REGISTRY_OWNER_PKEY missing');
  }
};

export const getHotWallet = async () => {
  const key = getHotWalletKey();
  const provider = await getOptimismProvider();
  return new Wallet(key, provider);
};

export const getRegistryOwnerWallet = async () => {
  const key = getOwnerWalletKey();
  const provider = await getOptimismProvider();
  return new Wallet(key, provider);
};

export const getAliasRegistry = (walletOrProvider: Wallet | providers.JsonRpcProvider) =>
  DpidAliasRegistry__factory.connect(ALIAS_REGISTRY_ADDRESS, walletOrProvider);

const getLegacyRpcProvider = async () => {
  const provider = new providers.JsonRpcProvider('https://reverse-proxy-prod.desci.com/rpc_sepolia');
  await provider.ready;
  return provider;
};

export const getTransactionTimestamps = async (txHashes: string[]): Promise<Record<string, string>> => {
  try {
    const provider = await getLegacyRpcProvider();

    // Get all transactions in parallel, caching results
    const txPromises = txHashes.map((hash) =>
      getOrCache(`tx-receipt-${hash}`, () => provider.getTransactionReceipt(hash)),
    );
    const txs = await Promise.all(txPromises);

    // Get unique block numbers, caching results
    const blockNumbers = [...new Set(txs.filter((tx) => tx !== null).map((tx) => tx.blockNumber))];

    // Fetch blocks in parallel, caching results
    const blockPromises = blockNumbers.map((num) =>
      getOrCache(`block-timestamp-${num}`, async () => await provider.getBlock(num)),
    );
    const blocks = await Promise.all(blockPromises);

    // Create a map of blockNumber -> timestamp
    const blockTimestamps = new Map<number, number>();
    blocks.forEach((block) => {
      blockTimestamps.set(block.number, block.timestamp);
    });

    // Map back to transaction hashes
    const result: Record<string, string> = {};
    txHashes.forEach((hash, index) => {
      const tx = txs[index];
      if (tx) {
        result[hash] = blockTimestamps.get(tx.blockNumber).toString();
      } else {
        result[hash] = undefined;
      }
    });

    return result;
  } catch (error) {
    logger.warn(error, 'Error fetching transaction timestamps');
    return {};
  }
};
