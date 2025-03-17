import { WalletProvider } from '@prisma/client';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { ensureUuidEndsWithDot } from '../utils.js';

const logger = parentLogger.child({
  module: 'SERVICES::PublishedWalletService',
});

export interface AddPublishedWalletParams {
  pubKey: string;
  userId: number;
  nodeUuid: string;
  provider: WalletProvider;
}

async function addPublishedWallet({ pubKey, userId, nodeUuid, provider }: AddPublishedWalletParams) {
  try {
    if (!nodeUuid.endsWith('.')) nodeUuid = ensureUuidEndsWithDot(nodeUuid);
    pubKey = pubKey.toLowerCase();

    // upsert to handle the case where the wallet is already recorded
    const result = await prisma.publishedWallet.upsert({
      where: {
        pubKey_nodeUuid_provider: {
          pubKey,
          nodeUuid,
          provider,
        },
      },
      update: {}, // No updates needed if it exists, only updatedAt should adjust
      create: {
        pubKey,
        userId,
        nodeUuid,
        provider,
      },
    });

    return { success: true, isNew: result.createdAt === result.updatedAt, wallet: result };
  } catch (error) {
    logger.error({ error, pubKey, userId, nodeUuid, provider }, 'Failed to add published wallet');
    throw error;
  }
}

async function getPublishedWalletsByUser(userId: number) {
  try {
    return await prisma.publishedWallet.findMany({
      where: { userId },
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get published wallets for user');
    throw error;
  }
}

async function getPublishedWalletsForNode(nodeUuid: string) {
  try {
    if (!nodeUuid.endsWith('.')) nodeUuid = ensureUuidEndsWithDot(nodeUuid);

    return await prisma.publishedWallet.findMany({
      where: { nodeUuid },
      orderBy: {
        createdAt: 'desc',
      },
    });
  } catch (error) {
    logger.error({ error, nodeUuid }, 'Failed to get published wallets for node');
    throw error;
  }
}

export const PublishedWalletService = {
  addPublishedWallet,
  getPublishedWalletsByUser,
  getPublishedWalletsForNode,
};
