import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL,
});
redisClient.connect();

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// gracefully shutdown
process.on('exit', () => {
  redisClient.quit();
});

export default redisClient;

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

export function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL) {
  return new Promise<T>(async (resolve, reject) => {
    try {
      const result = await redisClient.get(key);
      if (result !== null) {
        console.log(`[REDIS CACHE]${key} retrieved from cache`);
        return resolve(JSON.parse(result));
      }
      console.log(`[REDIS CACHE]${key} cached`);
      const value = await fn();
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
      resolve(value);
    } catch (e) {
      return reject(e);
    }
  });
}
