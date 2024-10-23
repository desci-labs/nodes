import os from 'os';

import { createClient } from 'redis';

import { logger as parentLogger } from './logger.js';

const hostname = os.hostname();
const logger = parentLogger.child({
  module: 'RedisClient',
  hostname,
});

export const redisClient = createClient({
  // url: process.env.REDIS_URL,
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    connectTimeout: 5000,
    reconnectStrategy: (times) => {
      // Try reconnect 3 times, then stop trying
      if (times > 3) {
        return false;
      }
      // Interval between retries
      return 5000;
    },
  },
});

async function initRedisClient() {
  if (process.env.NODE_ENV === 'test') return logger.warn('Redis client not being used in test environment');
  if (process.env.REDIS_HOST === undefined || process.env.REDIS_PORT === undefined) {
    logger.error(
      { fn: 'initRedisClient', redisHostEnv: process.env.REDIS_HOST, redisPortEnv: process.env.REDIS_PORT },
      'Redis host or port is not defined',
    );
    return;
  }
  if (!redisClient.isOpen) await redisClient.connect();
}
initRedisClient();

redisClient.on('connect', () => {
  logger.info({ port: process.env.REDIS_PORT }, 'Redis Client successfully connected on port');
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis Client Error');
});

export const ONE_WEEK_TTL = 60 * 60 * 24 * 7;
export const ONE_DAY_TTL = 60 * 60 * 24;
export const DEFAULT_TTL = ONE_WEEK_TTL;

/**
 * Get a value from cache, and optionally configure its on-hit TTL refresh
 */
export async function getFromCache<T>(key: string, ttl?: number): Promise<T | null> {
  let clientAvailable = true;

  if (!redisClient.isOpen) {
    logger.warn({ key }, 'Redis client is not connected');
    clientAvailable = false;
  }

  if (clientAvailable) {
    const result = await redisClient.get(key);
    if (result !== null) {
      logger.info(`[REDIS CACHE]${key} retrieved from cache`);
      redisClient.expire(key, ttl || DEFAULT_TTL);
      return JSON.parse(result);
    }
  }

  return null;
}

export async function delFromCache(key: string): Promise<void> {
  if (!redisClient.isOpen) {
    logger.info(`[REDIS CACHE] skipped-no-conn: DEL ${key}`);
    return;
  }

  await redisClient.del(key);
  logger.info(`[REDIS CACHE] DEL ${key}`);
}

export async function setToCache<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
  if (!redisClient.isOpen) {
    logger.info(`[REDIS CACHE] skipped-no-conn: SET ${key}`);
    return;
  }

  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  logger.info(`[REDIS CACHE] SET ${key}`);
}

export async function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  try {
    const cachedValue = await getFromCache<T>(key, ttl);
    if (cachedValue !== null) {
      return cachedValue;
    }

    const value = await fn();
    await setToCache<T>(key, value, ttl);
    return value;
  } catch (e) {
    throw e;
  }
}

class SingleNodeLockService {
  private isReady: boolean;
  private MAX_LOCK_TIME = process.env.MAX_LOCK_TIME ? parseInt(process.env.MAX_LOCK_TIME) : 60 * 60; // 1 hour
  private activeLocks: Set<string>;

  constructor() {
    if (redisClient.isOpen) {
      this.isReady = true;
    } else {
      redisClient.on('ready', () => {
        this.isReady = true;
        logger.info({ ready: redisClient.isReady, open: redisClient.isOpen }, 'REDIS CLIENT IS READY');
      });
    }
    logger.info({ ready: redisClient.isReady, open: redisClient.isOpen }, 'INIT SingleNodeLockService');
    this.activeLocks = new Set();
  }

  async aquireLock(key: string, lockTime = this.MAX_LOCK_TIME) {
    logger.info({ ready: this.isReady, open: redisClient.isOpen }, 'START ACQUIRE LOCK');
    if (!this.isReady) return false;
    const result = await redisClient.set(key, 'true', { NX: true, EX: lockTime });
    logger.info({ result, key }, 'END ACQUIRE LOCK');
    if (result) {
      this.activeLocks.add(key);
      return true;
    }
    return false;
  }

  async freeLock(key: string) {
    logger.info({ key }, 'FREE LOCK');
    this.activeLocks.delete(key);
    return await redisClient.del(key);
  }

  freeLocks() {
    logger.info({ locks: [...this.activeLocks] }, 'FREE ALL LOCKS');
    this.activeLocks.forEach((key) => redisClient.del(key));
  }
}

export const lockService = new SingleNodeLockService();
