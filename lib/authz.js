import redis from 'redis';
import Bossbat from 'bossbat';
import adapter from './idp_adapters/msgraph.js'
import log from '../util/logging.js'
import { getRouteForHostname, getIdpConfig, getConfig, getUserById} from '../util/config.js'
import {createJWT, decodeJWT} from '../util/jwt.js';
import timestring from 'timestring';

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

async function authZRequest(req, res) {
    var requestUrl = new URL(`${req.get("X-Forwarded-Protocol")}://${req.get("X-Forwarded-Host")}${req.get("X-Forwarded-Path")}`)
    var route = getRouteForHostname(requestUrl.hostname)
    var userId = req.session.userId
    var user = await getUserById(userId)
    if (!user) {
        res.sendStatus(401)
        return
    }
    var allowedGroups = route.allowed_groups

    var discoveredGroups = await checkUserGroupMembership(user, allowedGroups)
    console.log(discoveredGroups.length)
    if (discoveredGroups.length >= 1) {
        log.info({"action": "userIsAllowedBasedOnGroupMembership", "user": userId, context: {groupName: discoveredGroups, url: requestUrl, route: route}})
        await addRequestedHeaders(req, res, route, user,discoveredGroups)
        res.sendStatus(200)
        return
    }

    // Default deny
    log.info({"action": "userIsDenied", "user": userId, context: {groupName: discoveredGroups, url: requestUrl, route: route}})
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
                    aud: proxyTo.hostname
                }
                var encodedJwt = await createJWT(jwtPayload)
                res.set(header, encodedJwt)
            } else {
                res.set(header, user[headerValue])
            }
        }
    }
}

export default {
    scheduleUpdate,
    authZRequest
}