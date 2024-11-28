import path from 'path';

import { Chunk, StorageKey } from '@automerge/automerge-repo/slim';
import type { StorageAdapterInterface } from '@automerge/automerge-repo/slim';

import { DbDriver } from './db.js';

export class PostgresStorageAdapter implements StorageAdapterInterface {
  private cache: { [key: string]: Uint8Array } = {};
  tableName: string;

  constructor(private query: DbDriver['query']) {
    this.tableName = 'DocumentStore';
  }

  async load(keyArray: StorageKey): Promise<Uint8Array | undefined> {
    const key = getKey(keyArray);
    if (this.cache[key]) return this.cache[key];

    try {
      const result = await this.query(`SELECT * FROM "${this.tableName}" WHERE key = $1`, [key]);

      const response = result?.[0];
      // MUST RETURN UNDEFINED!
      if (!response) return undefined;
      return new Uint8Array(response.value);
    } catch (error) {
      console.error({ action: 'Load', key, error }, 'PostgresStorageAdaptser::Load ==> Error loading document');
      throw error;
    }
  }

  async save(keyArray: StorageKey, binary: Uint8Array): Promise<void> {
    const key = getKey(keyArray);
    this.cache[key] = binary;

    try {
      await this.query(
        `INSERT INTO "${this.tableName}" (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2 RETURNING key`,
        [key, Buffer.from(binary)],
      );
    } catch (e) {
      console.error({ e, key }, 'PostgresStorageAdapter::Save ==> Error saving document');
    }
  }

  async remove(keyArray: string[]): Promise<void> {
    const key = getKey(keyArray);
    // remove from cache
    delete this.cache[key];

    try {
      await this.query(`DELETE FROM "${this.tableName}" WHERE key = $1 RETURNING key`, [key]);
    } catch (e) {
      console.error({ e, key }, 'PostgresStorageAdapter::Remove ==> Error deleting document');
    }
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
      const result = await this.query(`DELETE FROM "${this.tableName}" WHERE key LIKE $1 RETURNING key`, [`${key}%`]);
    } catch (e) {
      console.error({ keyPrefix, key }, '[DELETE RANGE kEYS]');
    }
  }

  private cachedKeys(keyPrefix: string[]): string[] {
    const cacheKeyPrefixString = getKey(keyPrefix);
    return Object.keys(this.cache).filter((key) => key.startsWith(cacheKeyPrefixString));
  }

  private async loadRangeKeys(keyPrefix: string[]): Promise<string[]> {
    console.log('LoadRange Keys', { keyPrefix });
    const response = await this.query(`SELECT key FROM "${this.tableName}" WHERE key LIKE $1`, [`${keyPrefix}%`]);
    // console.log({ keyPrefix, response: response?.length }, '[LOADED RANGE Keys]');

    return response ? response.map((row) => row.key) : [];
  }
}

// HELPERS
const getKey = (key: StorageKey): string => path.join(...key);
