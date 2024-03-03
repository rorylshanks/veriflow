import yaml from 'js-yaml';
import fs from 'fs/promises';
import fsSync from 'fs';
import log from './logging.js';
import reloadCaddy from './caddyModels.js';
import chokidar from 'chokidar';

let configFileLocation = process.env.CONFIG_FILE || "config.yaml"

let currentConfig = yaml.load(fsSync.readFileSync(configFileLocation, 'utf8'))

const watcher = chokidar.watch(configFileLocation);

watcher.on('all', reloadConfig);

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



export {
    reloadConfig,
    getConfig,
    getRouteFromRequest
};