import yaml from 'js-yaml';
import fs from 'fs/promises';
import fsSync from 'fs';
import log from './logging.js';
import reloadCaddy from './caddyModels.js';
import chokidar from 'chokidar';
import metrics from './metrics.js'

let foundPort = false

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
        metrics.registry.veriflow_config_reloads_total.inc({result: "success"})
    } catch (error) {
        log.error({ message: "Failed to reload config", context: {error: error.message, stack: error.stack}})
        metrics.registry.veriflow_config_reloads_total.inc({result: "failed"})
    } finally {
        metrics.registry.veriflow_config_last_reload_time.setToCurrentTime()
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

function getRedirectBasepath() {
    var redirectBasePath = getConfig().redirect_base_path || "/.veriflow"
    if (!redirectBasePath.startsWith("/")) {
        redirectBasePath = `/${redirectBasePath}`
    }
    return redirectBasePath
}

function getAuthListenPort() {
    if (foundPort) {
        return foundPort
    }
    var config = getConfig()
    var metricsListenPort = config.metrics_listen_port
    var dataListenPort = config.data_listen_port
    var authListenPort = 9847
    while (foundPort == false) {
        if ((metricsListenPort == authListenPort) || (dataListenPort == authListenPort)) {
            log.info({ message: `Port ${authListenPort} is taken, trying another port for the auth service`})
            authListenPort++
        } else {
            foundPort = authListenPort
            log.debug({ message: `Found port ${foundPort} for the auth service to listen on`})
        }
    }
    return foundPort
}

export {
    reloadConfig,
    getConfig,
    getRouteFromRequest,
    getRedirectBasepath,
    getAuthListenPort
};