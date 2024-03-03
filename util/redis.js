import { Redis } from "ioredis"
import { getConfig } from '../util/config.js';

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

function getClient() {
    return redis
}

function getRedisConfig() {
    return redisConfig
}

export default {
    getClient,
    getRedisConfig
}