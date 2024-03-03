import redisHelper from "../util/redis.js"
import Bossbat from 'bossbat';
import log from '../util/logging.js'
import { getConfig } from '../util/config.js'
import timestring from 'timestring';

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
        var startDate = Date.now()
        await adapter.runUpdate()
        var endDate = Date.now()
        var duration = (endDate - startDate) / 1000
        log.info(`Updated users from IDP in ${duration} seconds`)
    } catch (error) {
        log.error({error, details: error.message})
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
    addNewUserFromClaims
}