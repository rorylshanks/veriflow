import yaml from 'js-yaml';
import fs from 'fs/promises';
import fsSync from 'fs';
import log from './logging.js';
import Cache from 'cache';
import redis from 'redis';
import reloadCaddy from './caddyModels.js';

const redisClient = redis.createClient({
    url: 'redis://' + process.env.REDIS_HOST
});

redisClient.on('error', (err) => {
    log.error('Redis error: ', err);
});

let idpRedisResponse = new Cache(60 * 1000);

let currentConfig = yaml.load(fsSync.readFileSync('config.yaml', 'utf8'))

async function reloadConfig() {
    log.debug("Reloading configuration")
    currentConfig = yaml.load(await fs.readFile('config.yaml', 'utf8'));
    reloadCaddy.generateCaddyConfig()
}

function getConfig() {
    return currentConfig
}

function getRouteForHostname(hostname) {
    return currentConfig.policy.find(element => element.from.includes(hostname))
}

async function getIdpConfig() {
    var idpResponse = idpRedisResponse.get("veriflow:users")
    if (idpResponse) {
        log.trace("Returning IDP users from cache")
        return idpResponse
    } else {
        try {
            log.debug("Cache miss, returning results from Redis")
            await redisClient.connect()
            var idpResponse = JSON.parse(await redisClient.get('veriflow:users'))
            idpRedisResponse.put("veriflow:users", idpResponse)
            await redisClient.disconnect();
            return idpResponse
        } catch (error) {
            log.error(error)
            return null
        }

    }
}

async function getUserById(id) {
    var config = await getIdpConfig()
    return config[id]
}

export {
    reloadConfig,
    getConfig,
    getIdpConfig,
    getRouteForHostname,
    getUserById
};