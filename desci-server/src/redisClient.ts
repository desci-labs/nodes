import { createClient } from 'redis';

import { logger as parentLogger } from './logger.js';
const logger = parentLogger.child({
  module: 'RedisClient',
});

const redisClient = createClient({
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

// gracefully shutdown
process.on('exit', () => {
  redisClient.quit();
});

export default redisClient;

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

export async function getFromCache<T>(key: string): Promise<T | null> {
  let clientAvailable = true;

  if (!redisClient.isOpen) {
    logger.warn({ key }, 'Redis client is not connected');
    clientAvailable = false;
  }

  if (clientAvailable) {
    const result = await redisClient.get(key);
    if (result !== null) {
      logger.info(`[REDIS CACHE]${key} retrieved from cache`);
      redisClient.expire(key, DEFAULT_TTL);
      return JSON.parse(result);
    }
  }

  return null;
}

export async function setToCache<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
  if (!redisClient.isOpen) {
    logger.info(`[REDIS CACHE] skipped-no-conn ${key}`);
    return;
  }

  await redisClient.set(key, JSON.stringify(value), { EX: ttl });
  logger.info(`[REDIS CACHE]${key} cached`);
}

export async function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  try {
    const cachedValue = await getFromCache<T>(key);
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
