import redis from 'redis';

const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis error:', err));

// gracefully shutdown
process.on('exit', () => {
  redisClient.quit();
});

export default redisClient;

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 1 week

export function getOrCache<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL) {
  return new Promise<T>((resolve, reject) => {
    redisClient.get(key, async (err, result) => {
      if (err) return reject(err);
      if (result !== null) {
        console.log(`[REDIS CACHE]${key} retrieved from cache`);
        return resolve(JSON.parse(result));
      }
      const value = await fn();
      redisClient.setex(key, ttl, JSON.stringify(value));
      resolve(value);
    });
  });
}
