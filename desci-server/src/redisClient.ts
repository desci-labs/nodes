import Redis from 'ioredis';

import parentLogger from 'logger';
const logger = parentLogger.child({
  module: 'RedisClient',
});

const CLUSTER_NODES_COUNT = parseInt(process.env.REDIS_CLUSTER_NODES) || 0;
const CLUSTER_PORT_START = parseInt(process.env.REDIS_CLUSTER_START_PORT) || 7000;
const CLUSTER_NODES = Array.from({ length: CLUSTER_NODES_COUNT }, (_, i) => ({
  host: `redis-node-${i + 1}`,
  port: CLUSTER_PORT_START + i,
  password: process.env.REDIS_PASSWORD,
}));

// default to single mode in local-dev, and cluster mode in production, unless REDIS_MODE env override is set
export const REDIS_MODE =
  (process.env.REDIS_MODE as 'single' | 'cluster') || (process.env.NODE_ENV === 'production' ? 'cluster' : 'single');

const redisClient =
  REDIS_MODE === 'cluster'
    ? new Redis.Cluster(CLUSTER_NODES)
    : new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD,
        connectTimeout: 5000,
        retryStrategy: (times) => {
          // Try reconnect 3 times, then stop trying
          if (times > 3) {
            return null; // Stop retrying
          }
          // Interval between retries
          return 5000;
        },
      });

redisClient.on('connect', () => {
  logger.info(
    { port: process.env.REDIS_PORT },
    `Redis Client successfully connected on port ${process.env.REDIS_PORT}`,
  );
});

redisClient.on('error', (err) => {
  logger.error({ err }, 'Redis Client Error');
  if (process.env.NODE_ENV === 'test') return logger.warn('Redis client not being used in test environment');
  if (process.env.REDIS_HOST === undefined || process.env.REDIS_PORT === undefined)
    logger.error(
      { fn: 'initRedisClient', redisHostEnv: process.env.REDIS_HOST, redisPortEnv: process.env.REDIS_PORT },
      'Redis host or port is not defined',
    );
});

// gracefully shutdown
process.on('exit', () => {
  redisClient.quit();
});

export default redisClient;

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

export async function getFromCache<T>(key: string): Promise<T | null> {
  let clientAvailable = true;

  // debugger;
  if (redisClient.status !== 'ready') {
    logger.warn({ key, redisStatus: redisClient.status }, 'Redis client is not connected');
    clientAvailable = false;
  }

  if (clientAvailable) {
    const result = await redisClient.get(key);
    if (result !== null) {
      // debugger;
      logger.info(`[REDIS CACHE]${key} retrieved from cache`);
      redisClient.expire(key, DEFAULT_TTL);
      return JSON.parse(result);
    }
  }

  return null;
}

export async function setToCache<T>(key: string, value: T, ttl = DEFAULT_TTL): Promise<void> {
  if (redisClient.status !== 'ready') {
    logger.info(`[REDIS CACHE] skipped-no-conn ${key}`);
    return;
  }

  await redisClient.set(key, JSON.stringify(value), 'EX', ttl);
  logger.info(`[REDIS CACHE]${key} cached`);
}

export async function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  try {
    const cachedValue = await getFromCache<T>(key);
    // debugger;
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
