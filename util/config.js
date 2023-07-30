import yaml from 'js-yaml';
import fs from 'fs/promises';
import fsSync from 'fs';
import log from './logging.js';
import Cache from 'cache';
import redis from 'redis';
import reloadCaddy from './caddyModels.js';

let currentConfig = yaml.load(fsSync.readFileSync('config.yaml', 'utf8'))

const redisClient = redis.createClient({
    url: 'redis://' + getConfig().redis_host + ":" + getConfig().redis_port
});
redisClient.connect()
redisClient.on('error', (err) => {
    log.error('Redis error: ', err);
});

let idpRedisResponse = new Cache(60 * 1000);

async function reloadConfig() {
    try {
        log.debug("Reloading configuration")
        currentConfig = yaml.load(await fs.readFile('config.yaml', 'utf8'));
        reloadCaddy.generateCaddyConfig()
    } catch (error) {
        log.error({ message: "Failed to reload config", context: {error: error.message, stack: error.stack}})
    }

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
            var idpResponse = JSON.parse(await redisClient.get('veriflow:users'))
            idpRedisResponse.put("veriflow:users", idpResponse)
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