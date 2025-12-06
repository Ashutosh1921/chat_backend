const Redis = require('ioredis');

let redisClient = null;

// Initialize Redis connection (optional - gracefully handle if not available)
const initRedis = () => {
    try {
        if (process.env.REDIS_URL) {
            redisClient = new Redis(process.env.REDIS_URL, {
                retryStrategy: () => null, // Don't retry - fail immediately
                maxRetriesPerRequest: 1,
                enableOfflineQueue: false,
            });

            redisClient.on('connect', () => {
                console.log('Redis connected successfully');
            });

            redisClient.on('error', (err) => {
                console.log('Redis unavailable - caching disabled');
                redisClient = null; // Disable Redis if connection fails
            });
        } else {
            console.log('Redis URL not provided. Caching disabled.');
        }
    } catch (error) {
        console.log('Redis initialization failed:', error.message);
        redisClient = null;
    }
};

/**
 * Get data from Redis cache
 * OPTIMIZATION: Reduces database queries for frequently accessed data
 */
const getCache = async (key) => {
    if (!redisClient) return null;

    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        // Silently fail and disable Redis
        redisClient = null;
        return null;
    }
};

/**
 * Set data in Redis cache with expiration
 */
const setCache = async (key, data, expirationInSeconds = 300) => {
    if (!redisClient) return;

    try {
        await redisClient.setex(key, expirationInSeconds, JSON.stringify(data));
    } catch (error) {
        // Silently fail and disable Redis
        redisClient = null;
    }
};

/**
 * Delete data from Redis cache
 */
const deleteCache = async (key) => {
    if (!redisClient) return;

    try {
        await redisClient.del(key);
    } catch (error) {
        console.error('Redis delete error:', error);
    }
};

/**
 * Delete all keys matching a pattern
 */
const deleteCachePattern = async (pattern) => {
    if (!redisClient) return;

    try {
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
            await redisClient.del(...keys);
        }
    } catch (error) {
        console.error('Redis delete pattern error:', error);
    }
};

module.exports = {
    initRedis,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern,
};
