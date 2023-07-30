import redis from 'redis';
import Bossbat from 'bossbat';
import adapter from './idp_adapters/localtest.js'
import log from '../util/logging.js'
import { getRouteForHostname, getIdpConfig, getConfig, getUserById} from '../util/config.js'
import {createJWT, decodeJWT} from '../util/jwt.js';

const redisClient = redis.createClient({
    url: 'redis://' + process.env.REDIS_HOST
});

const idpUpdater = new Bossbat({
    connection: { host: process.env.REDIS_HOST, port: 6379 },
    prefix: 'bossbat:',
});

redisClient.on('error', (err) => {
    log.error('Redis error: ', err);
});

async function update() {
    return new Promise(async (resolve, reject) => {
        try {
            var startDate = Date.now()
            var update = await adapter.runUpdate()
            await redisClient.connect()
            await redisClient.set('veriflow:users', JSON.stringify(update));
            await redisClient.disconnect();
            var endDate = Date.now()
            var duration = (endDate - startDate) / 1000
            log.info(`Updated users from IDP in ${duration} seconds`)
            resolve()
        } catch (error) {
            log.error(error)
            reject()
        }

    })

}

async function scheduleUpdate() {
    idpUpdater.hire('update-idp', {
        every: '10 minutes',
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
    var requestHost = new URL(`${req.get("X-Forwarded-Protocol")}://${req.get("X-Forwarded-Host")}`)
    var route = getRouteForHostname(requestHost.hostname)
    var userId = req.session.userId
    var user = await getUserById(userId)
    if (!user) {
        res.sendStatus(401)
        return
    }
    var allowedGroups = route.allowed_groups

    var discoveredGroups = await checkUserGroupMembership(user, allowedGroups)
    if (discoveredGroups) {
        log.info({"action": "userIsAllowedBasedOnGroupMembership", "user": userId, context: {groupName: discoveredGroups}})
        await addRequestedHeaders(req, res, route, user,discoveredGroups)
        res.sendStatus(200)
        return
    }
    
}

async function checkUserGroupMembership(user, groups) {
    // FIXME Change this to be a set in memory as part of the idpUpdate
    let set = new Set(user.groups);
    return groups.filter(item => set.has(item));
}

async function addRequestedHeaders(req, res, route, user, discoveredGroups) {
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
                    groups: discoveredGroups
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