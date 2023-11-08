import redis from 'redis';
import Bossbat from 'bossbat';
import log from '../util/logging.js'
import { getConfig, getUserById } from '../util/config.js'
import { createJWT } from '../util/jwt.js';
import timestring from 'timestring';
import Cache from 'cache';
import fs from 'fs/promises'

let requestHeaderMapCache = new Cache(60 * 1000);

const redisClient = redis.createClient({
    url: 'redis://' + getConfig().redis_host + ":" + getConfig().redis_port
});

redisClient.connect()

const idpUpdater = new Bossbat({
    connection: { host: getConfig().redis_host, port: getConfig().redis_port },
    prefix: 'bossbat:',
    ttl: timestring(getConfig().idp_refresh_directory_interval) * 1000
});

redisClient.on('error', (err) => {
    log.error('Redis error: ', err);
});

async function update() {
    try {
        var startDate = Date.now()
        var currentConfig = getConfig()
        let importedAdapter = await import(`./idp_adapters/${currentConfig.idp_provider}.js`)
        let adapter = importedAdapter.default
        var update = await adapter.runUpdate()
        await redisClient.set('veriflow:users', JSON.stringify(update));
        var endDate = Date.now()
        var duration = (endDate - startDate) / 1000
        log.info(`Updated users from IDP in ${duration} seconds`)
    } catch (error) {
        log.error(error)
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

async function authZRequest(req, res, route) {
    var requestUrl = new URL(`${req.get("X-Forwarded-Proto")}://${req.get("X-Forwarded-Host")}${req.get("X-Forwarded-Path") || ""}`)
    var userId = req.session.userId
    var user = await getUserById(userId)
    if (!user) {
        log.info({ "action": "userDoesNotExistInIdp", "user": userId, context: { url: requestUrl } })
        res.sendStatus(401)
        return
    }
    var allowedGroups = route.allowed_groups

    var discoveredGroups = await checkUserGroupMembership(user, allowedGroups)
    if (discoveredGroups.length >= 1) {
        log.info({ "action": "userIsAllowedBasedOnGroupMembership", "user": userId, context: { groupName: discoveredGroups, url: requestUrl, route: route } })
        await addRequestedHeaders(req, res, route, user, discoveredGroups)
        res.status(200).send("OK - Groups")
        return
    }

    // Default deny
    log.info({ "action": "userIsDenied", "user": userId, context: { groupName: discoveredGroups, url: requestUrl, route: route } })
    res.sendStatus(401)

}


async function checkUserGroupMembership(user, groups) {
    // FIXME Change this to be a set in memory as part of the idpUpdate
    let set = new Set(user.groups);
    return groups.filter(item => set.has(item));
}

async function addRequestedHeaders(req, res, route, user, discoveredGroups) {
    var proxyTo = new URL(route.to)
    res.set("x-veriflow-user-id", user.id)
    var additional_headers = route.claims_headers
    if (additional_headers) {
        for (var header of Object.keys(additional_headers)) {
            var headerValue = additional_headers[header]
            if (headerValue == "jwt") {
                var jwtPayload = {
                    oid: user.id,
                    uid: user.id,
                    sub: user.mail,
                    email: user.mail,
                    groups: discoveredGroups,
                    aud: route.jwt_override_audience || proxyTo.hostname
                }
                var encodedJwt = await createJWT(jwtPayload)
                res.set(header, encodedJwt)
            } else {
                res.set(header, user[headerValue])
            }
        }
    }
    if (route.request_header_map_headers && route.request_header_map_file) {
        var requestHeaderMap = await getRequestHeaderMapConfig(user.id, route)
        if (requestHeaderMap) {
            for (var header of route.request_header_map_headers) {
                if (requestHeaderMap[header]) {
                    res.set(header, requestHeaderMap[header])
                }
            }
        }
    }
}

async function getRequestHeaderMapConfig(userId, route) {
    var requestHeaderMap = requestHeaderMapCache.get(`${userId}-${route}`)
    if (requestHeaderMap) {
        log.trace("Returning requestHeaderMap from cache")
        return requestHeaderMap
    } else {
        try {
            log.debug("Cache miss, returning requestHeaderMap from file " + route.request_header_map_file)
            var requestHeaderMap = JSON.parse(await fs.readFile(route.request_header_map_file))
            if (requestHeaderMap[userId]) {
                requestHeaderMapCache.put(`${userId}-${route}`, requestHeaderMap[userId])
                return requestHeaderMap[userId]
            }
            return null
        } catch (error) {
            log.error({ message: "Unable to get config for requestHeaderMap", context: { error: error.message, stack: error.stack, route: route } })
            return null
        }

    }
}

export default {
    scheduleUpdate,
    authZRequest
}