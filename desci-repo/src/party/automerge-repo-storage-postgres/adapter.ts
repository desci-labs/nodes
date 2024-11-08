import path from 'path';

import { Chunk, StorageKey } from '@automerge/automerge-repo';
import type { StorageAdapterInterface } from '@automerge/automerge-repo';

// import { logger as parentLogger } from '../../logger.js';
import database, { DbDriver } from './db.js';

// const logger = parentLogger.child({ module: 'PostgresStorageAdapter' });

export class PostgresStorageAdapter implements StorageAdapterInterface {
  private cache: { [key: string]: Uint8Array } = {};
  tableName: string;
  query: DbDriver['query'];

  constructor() {
    this.tableName = 'DocumentStore';
  }

  async invokeHyperdrive(key: string, env: any): Promise<Response> {
    const requestPayload = { key };
    const request = new Request('https://your-worker.cloudflareworkers.com', {
      method: 'POST',
      body: JSON.stringify(requestPayload),
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      // Simulate fetch to the Worker
      const response = await fetch(request);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error invoking hyperdrive:', error);
      throw error;
    }
  }

  async load(keyArray: StorageKey): Promise<Uint8Array | undefined> {
    const key = getKey(keyArray);
    if (this.cache[key]) return this.cache[key];

    try {
      const result = await this.query(`SELECT * FROM "${this.tableName}" WHERE key = $1`, [key]);
      console.log({ value: result?.length, key }, '[LOAD DOCUMENT]::');

      const response = result?.[0];
      // MUST RETURN UNDEFINED!
      if (!response) return undefined;
      return new Uint8Array(response.value);
    } catch (error) {
      console.error({ action: 'Load', key }, 'PostgresStorageAdaptser::Load ==> Error loading document');
      throw error;
    }
  }

  async save(keyArray: StorageKey, binary: Uint8Array): Promise<void> {
    const key = getKey(keyArray);
    this.cache[key] = binary;

    try {
      console.log({ action: 'Save', key }, 'PostgresStorageAdaptser::Save');

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
      console.log({ action: 'Remove', key }, 'PostgresStorageAdapter::Remove');
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
      console.log({ key, keyPrefix }, 'DELETE DOCUMENT RANGE');
      const result = await this.query(`DELETE FROM "${this.tableName}" WHERE key LIKE $1 RETURNING key`, [`${key}%`]);
      console.log({ result, key }, 'DELETED MANY RANGE');
    } catch (e) {
      console.error({ keyPrefix, key }, '[DELETE RANGE kEYS]');
    }
  }

  private cachedKeys(keyPrefix: string[]): string[] {
    const cacheKeyPrefixString = getKey(keyPrefix);
    return Object.keys(this.cache).filter((key) => key.startsWith(cacheKeyPrefixString));
  }

  private async loadRangeKeys(keyPrefix: string[]): Promise<string[]> {
    console.log({ keyPrefix }, 'LoadRange Keys');
    const response = await this.query(`SELECT key FROM "${this.tableName}" WHERE key LIKE $1`, [`${keyPrefix}%`]);
    console.log({ keyPrefix, response: response?.length }, '[LOADED RANGE Keys]');

    return response ? response.map((row) => row.key) : [];
  }
}

// HELPERS
const getKey = (key: StorageKey): string => path.join(...key);
