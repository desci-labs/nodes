import { createClient } from 'redis';

import parentLogger from 'logger';
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

export function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL) {
  return new Promise<T>(async (resolve, reject) => {
    try {
      if (!redisClient.isOpen) return reject(new Error('Redis client is not connected'));
      const result = await redisClient.get(key);
      if (result !== null) {
        logger.info(`[REDIS CACHE]${key} retrieved from cache`);

        // bump ttl for active cached items
        redisClient.expire(key, ttl);

        return resolve(JSON.parse(result));
      }
      logger.info(`[REDIS CACHE]${key} cached`);
      const value = await fn();
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
      resolve(value);
    } catch (e) {
      return reject(e);
    }
  });
}
