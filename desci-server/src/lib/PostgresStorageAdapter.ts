import path from 'path';

import { Chunk, StorageAdapter, StorageKey } from '@automerge/automerge-repo';

import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({ module: 'PostgresStorageAdapter' });
export class PostgresStorageAdapter extends StorageAdapter {
  private client: typeof prisma;
  private cache: { [key: string]: Uint8Array } = {};

  constructor(client: typeof prisma) {
    super();
    this.client = client;
  }

  async load(keyArray: StorageKey): Promise<Uint8Array> {
    const key = getKey(keyArray);
    if (this.cache[key]) return this.cache[key];

    try {
      const response = await this.client.documentStore.findFirst({ where: { key } });
      if (!response) return undefined;
      return new Uint8Array(response.value);
    } catch (error) {
      throw error;
    }
  }

  async save(keyArray: StorageKey, binary: Uint8Array): Promise<void> {
    const key = getKey(keyArray);
    logger.info({ action: 'Save', key }, 'PostgresStorageAdapter::Save');
    this.cache[key] = binary;

    try {
      await this.client.documentStore.upsert({
        where: { key },
        create: { key, value: Buffer.from(binary) },
        update: { value: Buffer.from(binary) },
      });
    } catch (e) {}
  }

  async remove(keyArray: string[]): Promise<void> {
    const key = getKey(keyArray);
    // remove from cache
    delete this.cache[key];
    try {
      await this.client.documentStore.delete({ where: { key: key } });
    } catch (e) {}
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const cachedKeys = this.cachedKeys(keyPrefix);
    const storedKeys = await this.loadRangeKeys(keyPrefix);
    const allKeys = [...new Set([...cachedKeys, ...storedKeys])];

    const chunks = await Promise.all(
      allKeys.map(async (keyString) => {
        const key: StorageKey = keyString.split(path.sep);
        const data = await this.load(key);
        return { data, key };
      }),
    );
    return chunks;
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    const key = getKey(keyPrefix);
    this.cachedKeys(keyPrefix).forEach((key) => delete this.cache[key]);
    try {
      await this.client.documentStore.deleteMany({ where: { key: { startsWith: key } } });
    } catch (e) {}
  }

  private cachedKeys(keyPrefix: string[]): string[] {
    const cacheKeyPrefixString = getKey(keyPrefix);
    return Object.keys(this.cache).filter((key) => key.startsWith(cacheKeyPrefixString));
  }

  private async loadRangeKeys(keyPrefix: string[]): Promise<string[]> {
    const response = await this.client.documentStore.findMany({
      where: { key: { startsWith: getKey(keyPrefix) } },
      select: { key: true },
    });
    return response.map((row) => row.key);
  }
}

// HELPERS
const getKey = (key: StorageKey): string => path.join(...key);
