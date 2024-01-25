import path from 'path';

import { Chunk, StorageAdapter, StorageKey } from '@automerge/automerge-repo';

import { logger as parentLogger } from '../logger.js';
import { query } from '../db/index.js';

const logger = parentLogger.child({ module: 'PostgresStorageAdapter' });
export class PostgresStorageAdapter extends StorageAdapter {
  private cache: { [key: string]: Uint8Array } = {};
  tableName: string;

  constructor() {
    super();
    this.tableName = 'DocumentStore';
  }

  async load(keyArray: StorageKey): Promise<Uint8Array> {
    const key = getKey(keyArray);
    if (this.cache[key]) return this.cache[key];

    try {
      const result = await query(`SELECT * FROM "${this.tableName}" WHERE key = $1`, [key]);
      console.log('LOAD DOCUMENT', result.length, key);

      const response = result[0];
      if (!response) return undefined;
      return new Uint8Array(response.value);
    } catch (error) {
      logger.error({ action: 'Load', key }, 'PostgresStorageAdaptser::Load ==> Error loading document');
      throw error;
    }
  }

  async save(keyArray: StorageKey, binary: Uint8Array): Promise<void> {
    const key = getKey(keyArray);
    this.cache[key] = binary;

    try {
      logger.info({ action: 'Save', key }, 'PostgresStorageAdaptser::Save');

      const saved = await query(
        `INSERT INTO "${this.tableName}" (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2 RETURNING key`,
        [key, Buffer.from(binary)],
      );
      console.log('[SAVE]', key, saved.length);
    } catch (e) {
      console.log('[SAVE ERROR]', e);
      logger.error({ e }, 'PostgresStorageAdapter::Save ==> Error saving document');
    }
  }

  async remove(keyArray: string[]): Promise<void> {
    const key = getKey(keyArray);
    // remove from cache
    delete this.cache[key];

    try {
      logger.info({ action: 'Remove', key }, 'PostgresStorageAdaptser::Remove');

      const result = await query(`DELETE FROM "${this.tableName}" WHERE key = $1 RETURNING key`, [key]);
      console.log('[DELETED DOCUMENT]', result.length);
    } catch (e) {
      console.log('DELETED DOCUMENT ERROR', key);
      logger.error({ e }, 'PostgresStorageAdapter::Remove ==> Error deleting document');
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
      console.log('DELETE DOCUMENT RANGE', keyPrefix);
      const result = await query(`DELETE FROM "${this.tableName}" WHERE key LIKE $1 RETURNING key`, [`${key}%`]);
      console.log('DELETED MANY DOCUMENT', result.length);
    } catch (e) {
      console.log('DELETE RANGE ERROR', e);
      logger.error({ keyPrefix, module: 'PostgresStorageAdapter' }, 'DELETE RANGE Keys');
    }
  }

  private cachedKeys(keyPrefix: string[]): string[] {
    const cacheKeyPrefixString = getKey(keyPrefix);
    return Object.keys(this.cache).filter((key) => key.startsWith(cacheKeyPrefixString));
  }

  private async loadRangeKeys(keyPrefix: string[]): Promise<string[]> {
    logger.info({ keyPrefix, module: 'PostgresStorageAdapter' }, 'LoadRange Keys');
    const response = await query(`SELECT key FROM "${this.tableName}" WHERE key LIKE $1`, [`${keyPrefix}%`]);
    logger.info({ keyPrefix, module: 'PostgresStorageAdapter' }, 'LoadRange Keys');
    console.log('LOAD RANGE KEYS', response.length);

    return response.map((row) => row.key);
  }
}

// HELPERS
const getKey = (key: StorageKey): string => path.join(...key);
