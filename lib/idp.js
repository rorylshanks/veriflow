import redisHelper from "../util/redis.js"
import Bossbat from 'bossbat';
import log from '../util/logging.js'
import { getConfig } from '../util/config.js'
import timestring from 'timestring';
import metrics from '../util/metrics.js'

const idpUpdater = new Bossbat({
    connection: redisHelper.getRedisConfig(),
    prefix: 'bossbat:',
    ttl: timestring(getConfig().idp_refresh_directory_interval) * 1000
});

var currentConfig = getConfig()
let importedAdapter = await import(`./idp_adapters/${currentConfig.idp_provider}.js`)
let adapter = importedAdapter.default

async function update() {
    try {
        const end = metrics.registry.veriflow_idp_update_duration.startTimer();
        var startDate = Date.now()
        await adapter.runUpdate()
        var endDate = Date.now()
        var duration = (endDate - startDate) / 1000
        end()
        log.info(`Updated users from IDP in ${duration} seconds`)
        metrics.registry.veriflow_idp_update_total.inc({ result: "success" })
        metrics.registry.veriflow_idp_last_update_time.setToCurrentTime({ result: "success"})
    } catch (error) {
        log.error({error, details: error.message})
        metrics.registry.veriflow_idp_update_total.inc({ result: "failed" })
        metrics.registry.veriflow_idp_last_update_time.setToCurrentTime({ result: "failed"})
    }
}

async function scheduleUpdate() {
    let config = getConfig()
    if (config.refresh_idp_at_start) {
        update()
    }
    idpUpdater.hire('update-idp', {
        every: getConfig().idp_refresh_directory_interval,
        work: async () => {
            try {
                await update()
            } catch (error) {
                log.error({ message: "Failed up update users and groups from IDP", error })
            }
        },
    });
}

async function getUserById(userId) {
    var user = await adapter.getUserById(userId)
    return user
}

async function getAllUsers() {
    var users = await adapter.getAllUsers()
    return users
}

async function addNewUserFromClaims(userClaims) {
    if (!adapter.addNewUserFromClaims) {
        log.debug({ message: `Adapter ${currentConfig.idp_provider} does not support adding new users via claims, returning`, context: { claims: userClaims } })
        return
    }
    log.debug({ message: "Attempting to add new user from claims", context: { claims: userClaims } })
    await adapter.addNewUserFromClaims(userClaims)
}

export default {
    getUserById,
    scheduleUpdate,
    addNewUserFromClaims,
    getAllUsers
}