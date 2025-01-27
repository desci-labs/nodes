import { getHeapStatistics, writeHeapSnapshot } from 'node:v8';
import { logger } from './logger.js';
import { UTCDate } from '@date-fns/utc';
import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { appendFileSync } from 'node:fs';

/**
 * Dumps the heap to a file in heap-snapshots IF the DUMP_HEAP envvar is set.
 * Set `id` to something that makes sense, like "before-save" or "chunk-${ix}`
 * so you can compare allocations in loops.
 */
export const maybeDumpHeap = (id: string) => {
  if (process.env.DUMP_HEAP) {
    logger.warn({ id }, 'Starting heap dump...');
    const start = Date.now();
    writeHeapSnapshot(`heap-snapshots/${id}.heapsnapshot`);
    logger.info({ id, duration: getDuration(start, Date.now())}, 'Heap dump finished');
  }
};

export const getDuration = (start: number, end: number) => Math.floor((end - start) / 1_000);

export async function* chunkGenerator<T>(array: T[], size: number): AsyncGenerator<T[]> {
  for (let i = 0; i < array.length; i += size) {
    yield array.slice(i, i + size);
  }
}

export const getHeapStats = () => {
  const used = process.memoryUsage().heapUsed;
  const max = getHeapStatistics().heap_size_limit;
  const heapUtilisation = (used / max).toFixed(2);

  return {
    using: `${bytesToGb(used)} Gb`,
    limit: `${bytesToGb(max)} Gb`,
    utilisation: heapUtilisation,
  };
};

const bytesToGb = (b: number) => (b / 1024 / 1024 / 1024).toFixed(2);

export const logMetricsAndGetTime = (tPrev: number, step: string) => {
  const tNew = Date.now();
  const heap = getHeapStats();

  logger.info(
    {
      duration: `${getDuration(tPrev, tNew)} s`,
      heapStats: heap,
    },
    `Metrics::${step}`,
  );
  return tNew;
};

export const parseDate = (dateString: string): UTCDate | undefined => {
  try {
    return new UTCDate(dateString);
  } catch (err) {
    logger.error({ err }, '[Error]::Parsing Date args');
    return undefined;
  }
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export const countArrayLengths = (obj: Record<string, any[]>): Record<string, number> => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, value.length])
  );
};

export const dropTime = (datestr: string) =>
  datestr.split('T')[0];
