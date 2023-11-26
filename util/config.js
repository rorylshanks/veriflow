import yaml from 'js-yaml';
import fs from 'fs/promises';
import fsSync from 'fs';
import log from './logging.js';
import Cache from 'cache';
import redis from 'redis';
import reloadCaddy from './caddyModels.js';
import chokidar from 'chokidar';

let configFileLocation = process.env.CONFIG_FILE || "config.yaml"

let currentConfig = yaml.load(fsSync.readFileSync(configFileLocation, 'utf8'))

const watcher = chokidar.watch(configFileLocation);

watcher.on('all', reloadConfig);

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
        var tempConfig = yaml.load(await fs.readFile(configFileLocation, 'utf8'));
        if (tempConfig) {
            currentConfig = tempConfig
        }
        reloadCaddy.generateCaddyConfig()
    } catch (error) {
        log.error({ message: "Failed to reload config", context: {error: error.message, stack: error.stack}})
    }

}

function getConfig() {
    return currentConfig
}

function getRouteFromRequest(req) {
    var config = getConfig()
    var routeId = req.get("X-Veriflow-Route-Id")
    if (!routeId) {
        log.error({ message: "No route ID included in request", context: {route, hostname: hostname, numRoutes: config.policy.length}})
        return null
    }
    var route = config.policy[routeId]
    if (route) {
        return route
    } else {
        log.error({ message: "Failed to find route for hostname", context: {route, hostname: hostname, numRoutes: config.policy.length}})
        return null
    }
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
    if (!config) {
        return null
    }
    return config[id]
}

export {
    reloadConfig,
    getConfig,
    getIdpConfig,
    getRouteFromRequest,
    getUserById
};