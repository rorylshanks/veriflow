import { Redis } from "ioredis"
import { getConfig } from '../util/config.js';
import RedisStore from 'connect-redis';
import log from './logging.js';

var currentConfig = getConfig()
var redisConfig

if (currentConfig.redis_connection_string) {
    redisConfig = currentConfig.redis_connection_string
} else {
    redisConfig = {
        port: currentConfig.redis_port,
        host: currentConfig.redis_host
      }
}

const redis = new Redis(redisConfig)

let redisStore = new RedisStore({
    client: redis,
    prefix: "vfsession:"
})

function getClient() {
    return redis
}

function getRedisConfig() {
    return redisConfig
}

function getRedisStore() {
    return redisStore
}

async function logUserOutAllSessions(userId) {
    var sessions = await getAllSessionsForUser(userId)
    for (const session of sessions) {
        log.debug({ message: `Logged user ${userId} out of session ${session.sessionId}` })
        await redis.del(`vfsession:${session.sessionId}`);
    }
}

// FIXME This is a really inefficent way to handle these requests. Make this more efficent

async function getAllSessionsForUser(userId) {
    const allSessions = await getAllSessions();
    return allSessions.filter(session => session.userId === userId);
}

async function getAllSessions() {
    const keys = await scanKeys('vfsession:*');
    const sessions = [];
    for (const key of keys) {
        const sessionDataRaw = await redis.get(key);
        if (sessionDataRaw) {
            let sessionData = JSON.parse(sessionDataRaw);
            // Extract session ID from key and add it to the session object
            const sessionId = key.replace('vfsession:', '');
            sessionData.sessionId = sessionId;
            sessions.push(sessionData);
        }
    }
    return sessions;
}

// Utility function to use SCAN for fetching keys without blocking the server
async function scanKeys(pattern) {
    let cursor = '0';
    const keys = [];
    do {
        const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
        cursor = reply[0];
        keys.push(...reply[1]);
    } while (cursor !== '0');
    return keys;
}

async function deleteSession(sessionId) {
    await redis.del(`vfsession:${sessionId}`);
}

export default {
    getClient,
    getRedisConfig,
    getRedisStore,
    logUserOutAllSessions,
    getAllSessions,
    deleteSession
}