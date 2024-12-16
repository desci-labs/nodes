/**
 * This module provides a storage adapter for Durable Objects.
 *
 * https://github.com/partykit/partykit/blame/main/packages/y-partykit/src/storage.ts
 * @packageDocumentation
 */

import { DurableObjectStorage } from '@cloudflare/workers-types';
import { type Chunk, type StorageAdapterInterface, type StorageKey } from '@automerge/automerge-repo';

export class DurableObjectStorageAdapter implements StorageAdapterInterface {
  /** Create a new {@link DurableObjectStorageAdapter}.
   * @param db - See https://developers.cloudflare.com/durable-objects/api/transactional-storage-api/.
   */
  constructor(private db: DurableObjectStorage) {}

  async load(keyArray: string[]): Promise<Uint8Array | undefined> {
    console.log('load', keyArray);
    const db = this.db;
    const prefix = keyEncoding.encode(keyArray);

    const res = await db.list<Uint8Array>({
      start: prefix,
      end: `${prefix}#zzzzz`,
    });

    if (res.size === 0) {
      return;
    }

    return concatUint8Arrays(Array.from(res.values()));
  }

  async save(keyArray: string[], binary: Uint8Array): Promise<void> {
    console.log('save', keyArray);
    const db = this.db;

    // Value size has limit of 128kb
    // https://developers.cloudflare.com/durable-objects/platform/limits/
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < binary.length; i += 128 * 1024) {
      chunks.push(binary.slice(i, i + 128 * 1024));
    }

    const keyPrefix = keyEncoding.encode(keyArray);
    const puts: Promise<void>[] = [];
    for (let i = 0; i < chunks.length; i++) {
      puts.push(db.put(`${keyPrefix}#${i.toString().padStart(3, '0')}`, chunks[i]));
    }
    await Promise.all(puts);
  }

  async remove(keyArray: string[]): Promise<void> {
    const db = this.db;
    const prefix = keyEncoding.encode(keyArray);

    const res = await db.list<Uint8Array>({
      start: prefix,
      end: `${prefix}#zzzzz`,
    });

    if (res.size === 0) {
      return;
    }

    const keys = [...res.keys()];

    // Delete only supports up to 128 keys at a time.
    // https://developers.cloudflare.com/durable-objects/api/transactional-storage-api/#delete
    await db.transaction(() => Promise.all(chunk(keys, 128).map((keysToDelete) => db.delete(keysToDelete))));
  }

  async loadRange(keyPrefix: string[]): Promise<Chunk[]> {
    console.log('loadRange', keyPrefix);
    const db = this.db;
    const lowerBound = keyPrefix;
    const upperBound = [...keyPrefix, '\uffff'];

    const res = await db.list<Uint8Array>({
      start: keyEncoding.encode(lowerBound),
      end: keyEncoding.encode(upperBound),
    });

    // Group chunks together by encoded prefixes.
    const grouped = groupBy(Array.from(res.entries()), ([key]) => key.split('#').slice(0, -1).join('#'));

    const result: Chunk[] = [];
    for (const [key, values] of grouped.entries()) {
      result.push({
        key: keyEncoding.decode(key),
        data: concatUint8Arrays(values.map((val) => val[1])),
      });
    }

    return result;
  }

  async removeRange(keyPrefix: string[]): Promise<void> {
    const db = this.db;
    const lowerBound = keyPrefix;
    const upperBound = [...keyPrefix, '\uffff'];

    const keys = await getKeyRangeAsEncoded(db, {
      gte: lowerBound,
      lt: upperBound,
    });

    // Delete only supports up to 128 keys at a time.
    // https://developers.cloudflare.com/durable-objects/api/transactional-storage-api/#delete
    await db.transaction(() => Promise.all(chunk(keys, 128).map((keysToDelete) => db.delete(keysToDelete))));
  }
}

/**
 * Keys are arrays of strings, so we keep a
 * couple of helpers to encode/decode them.
 */
const keyEncoding = {
  encode(arr: StorageKey) {
    return arr.join('#');
  },
  decode(str: string): StorageKey {
    return str.split('#');
  },
};

/**
 * Return the actual encoded keys in a range of keys
 */
export async function getKeyRangeAsEncoded(
  db: DurableObjectStorage,
  opts: {
    gte: StorageKey;
    lt: StorageKey;
  },
): Promise<string[]> {
  const res = await db.list<Uint8Array>({
    start: keyEncoding.encode(opts.gte),
    end: keyEncoding.encode(opts.lt),
  });

  return [...res.keys()];
}

function groupBy<T>(arr: T[], fn: (el: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const el of arr) {
    const key = fn(el);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(el);
  }
  return map;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const arrayLength = arrays.reduce((acc, val) => acc + val.length, 0);
  const array = new Uint8Array(arrayLength);
  let offset = 0;
  for (const val of arrays) {
    array.set(val, offset);
    offset += val.length;
  }
  return array;
}
