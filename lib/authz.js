import log from '../util/logging.js'
import idp from './idp.js'
import { createJWT } from '../util/jwt.js';
import Cache from 'cache';
import fs from 'fs/promises'
import pm from 'picomatch';

let requestHeaderMapCache = new Cache(60 * 1000);

async function authZRequest(req, res, route) {
    var requestUrl = new URL(`${req.get("X-Forwarded-Proto")}://${req.get("X-Forwarded-Host")}${req.get("X-Forwarded-Path") || ""}`)
    var userId = req.session.userId
    // If the request is authenticated with a machine token, do not check the IdP for the user, as the machine is not really a human.
    // Rather check against the AuthZ config in the token auth file
    var isMachineToken = req.session.machine_token
    if (isMachineToken === true) {
        var tokenAuthZ = checkTokenAuthHeaders(req, route)
        if (tokenAuthZ === true) {
            var userObject = req.session.token
            log.access("userIsAllowedBasedOnMachineToken", route, userObject, req)
            await addRequestedHeaders(req, res, route, userObject, null)
            return "OK - Machine Token"
        } else {
            return false
        }
    }
    var user = await idp.getUserById(userId)
    if (!user) {
        log.infoWithContext(req, { "action": "userDoesNotExistInIdp", "user": userId, context: { url: requestUrl } })
        return false
    }
    var allowedGroups = route.allowed_groups

    var discoveredGroups = await checkUserGroupMembership(user, allowedGroups)
    if (discoveredGroups.length >= 1) {
        log.infoWithContext(req, { discoveredGroups })
        log.access("userIsAllowedBasedOnGroupMembership", route, user, req)
        await addRequestedHeaders(req, res, route, user, discoveredGroups)
        return "OK - Groups"
    }

    // Default deny
    log.access("userIsDenied", route, user, req)
    return false

}


async function checkUserGroupMembership(user, groups) {
    // FIXME Change this to be a set in memory as part of the idpUpdate
    let set = new Set(user.groups);
    return groups.filter(item => set.has(item));
}

async function addRequestedHeaders(req, res, route, user, discoveredGroups) {
    var proxyTo = {}
    try {
        var rawURL = route.to.url || route.to.name || route.to
        var urlWithPrefix = rawURL.startsWith("http") ? rawURL : `http://${rawURL}`
        proxyTo = new URL(urlWithPrefix)
    } catch (error) {
        log.warn({ message: "Unable to get audience from route", context: { error: error.message, stack: error.stack, route: route } })
    }
    
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
                    aud: route.jwt_override_audience || proxyTo.hostname || "unknown_aud"
                }
                var encodedJwt = await createJWT(jwtPayload)
                res.set(header, encodedJwt)
            } else {
                res.set(header, user[headerValue])
            }
        }
    }
    if (route.request_header_map_headers && (route.request_header_map_file || route.request_header_map_inline)) {
        var requestHeaderMap = await getRequestHeaderMapConfig(user, route)
        if (requestHeaderMap) {
            for (var header of route.request_header_map_headers) {
                if (requestHeaderMap[header]) {
                    res.set(header, requestHeaderMap[header])
                }
            }
        }
    }
}

async function getRequestHeaderMapConfig(user, route) {
    var userId = user.id
    var userGroups = user.groups || []
    var requestHeaderMap = requestHeaderMapCache.get(`${userId}-${JSON.stringify(route)}`)
    if (requestHeaderMap) {
        log.trace("Returning requestHeaderMap from cache")
        return requestHeaderMap
    } else {
        var result = {}
        try {
            log.debug("Cache miss, returning requestHeaderMap from file " + route.request_header_map_file)
            if (route.request_header_map_file) {
                var requestHeaderMap = JSON.parse(await fs.readFile(route.request_header_map_file))
            } else {
                var requestHeaderMap = route.request_header_map_inline
            }
            
            for (var group of Object.keys(requestHeaderMap)) {
                // This is not mega efficient as often the number of groups a user is in can be large,
                // however this allows the config to be deterministic if a user is a member of multiple
                // groups that individually have an entry in the header map config
                // Providing the user is not a member of many groups the performance should be fine
                if (userGroups.includes(group)) {
                    result = {
                        ...result,
                        ...requestHeaderMap[group],
                    }
                }
            }
            if (requestHeaderMap[userId]) {
                result = {
                    ...result,
                    ...requestHeaderMap[userId],
                }
            }
            requestHeaderMapCache.put(`${userId}-${JSON.stringify(route)}`, result)
            return result
        } catch (error) {
            log.error({ message: "Unable to get config for requestHeaderMap", context: { error: error.message, stack: error.stack, route: route } })
            return null
        }

    }
}

function checkTokenAuthHeaders(req, route) {
    var token = req.session.token
    var domainIsAllowed = true
    var pathIsAllowed = true
    var methodIsAllowed = true 

    if (token.valid_domains) {
        domainIsAllowed = pm.isMatch((route.from.url || route.from), token.valid_domains) || pm.isMatch((route.to.url || route.to), token.valid_domains)
    }
    if (token.valid_paths) {
        var path = req.get("X-Forwarded-Path")
        pathIsAllowed = pm.isMatch(path, token.valid_paths)
    }
    if (token.valid_methods) {
        var method = req.get("X-Forwarded-Method")
        methodIsAllowed = pm.isMatch(method, token.valid_methods)
    }
    if (domainIsAllowed && pathIsAllowed && methodIsAllowed) {
        return true
    } else {
        log.infoWithContext(req, { message: `Token valid but not AuthZ : Domain: ${domainIsAllowed}, Path: ${pathIsAllowed}, Method: ${methodIsAllowed}`, context: { user: token.userId, route } })
        return null
    }
}

export default {
    authZRequest,
    checkUserGroupMembership
}