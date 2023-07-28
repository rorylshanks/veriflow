import yaml from 'js-yaml';
import fs from 'fs/promises';
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

let currentConfig

async function reloadConfig() {
    log.debug("Reloading configuration")
    currentConfig = yaml.load(await fs.readFile('config.yaml', 'utf8'));
    reloadCaddy.generateCaddyConfig()
}

async function generateCaddyConfig() {

}

function getConfig() {
    return currentConfig
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
            var idpResponse = await redisClient.get('veriflow:users');
            await redisClient.disconnect();
            return idpResponse
        } catch (error) {
            log.error(error)
            return null
        }

    }
}

export {
    reloadConfig,
    getConfig,
    getIdpConfig
};