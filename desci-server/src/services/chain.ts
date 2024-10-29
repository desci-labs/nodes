import { DpidAliasRegistry__factory } from '@desci-labs/desci-contracts/dist/typechain-types/index.js';
import { providers, Wallet } from 'ethers';

import { ALIAS_REGISTRY_ADDRESS, GANACHE_PKEY, OPTIMISM_RPC_URL, serverIsLocal } from '../config/index.js';
import { logger as parentLogger } from '../logger.js';

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

export const getAliasRegistry = (wallet: Wallet) => DpidAliasRegistry__factory.connect(ALIAS_REGISTRY_ADDRESS, wallet);
