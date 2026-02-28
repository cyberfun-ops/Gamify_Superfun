const Redis = require('ioredis');

let client = null;
let redisAvailable = false;

// No-op stub used when Redis is unavailable (local dev without Redis)
const noopClient = {
  ping:    () => Promise.resolve('PONG'),
  hset:    () => Promise.resolve(0),
  hget:    () => Promise.resolve(null),
  hgetall: () => Promise.resolve(null),
  llen:    () => Promise.resolve(0),
  lpop:    () => Promise.resolve(null),
  rpush:   () => Promise.resolve(0),
  del:     () => Promise.resolve(0),
};

function getRedis() {
  return (redisAvailable && client) ? client : noopClient;
}

function isRedisAvailable() {
  return redisAvailable;
}

async function initRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  return new Promise((resolve) => {
    const c = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,  // fail fast, no retries
      lazyConnect: true,
    });

    c.once('ready', () => {
      client = c;
      redisAvailable = true;
      console.log('[Redis] Connected');
      resolve(true);
    });

    c.once('error', (err) => {
      console.warn(`[Redis] Not available (${err.message}) — running in single-instance mode.`);
      c.disconnect();
      resolve(false);
    });

    c.connect().catch(() => resolve(false));
  });
}

module.exports = { initRedis, getRedis, isRedisAvailable };
