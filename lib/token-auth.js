import pm from 'picomatch';
import fs from 'fs/promises'
import Cache from 'cache';
import { getConfig, getRouteForHostname } from '../util/config.js';
import log from '../util/logging.js'

let tokenHeaderCache = new Cache(60 * 1000);

async function getConfigFromToken(token, route) {
    var tokenConfig = tokenHeaderCache.get(token)
    if (tokenConfig) {
        log.trace("Returning tokenConfig from cache")
        return tokenConfig
    } else {
        try {
            log.debug("Cache miss, returning results from file " + route.token_auth_config_file)
            var tokenConfig = JSON.parse(await fs.readFile(route.token_auth_config_file))
            if (tokenConfig[token]) {
                tokenHeaderCache.put(token, tokenConfig[token])
                return tokenConfig[token]
            }
            return null
        } catch (error) {
            log.error({ message: "Unable to get config from token", context: { error: error.message, stack: error.stack } })
            return null
        }

    }
}

async function checkAuthHeader(req, res, route) {
    var headerToCheck = route.token_auth_header
    var headerValue = req.get(headerToCheck)
    if (!headerValue) {
        log.warn({ message: "Auth header has unexpected value, returning" })
        return null
    }
    if (route.token_auth_header_prefix) {
        if (headerValue.startsWith(route.token_auth_header_prefix)) {
            headerValue = headerValue.slice(route.token_auth_header_prefix.length);
          }
    }
    if (route.token_auth_is_base64_encoded) {
        var decoded = Buffer.from(headerValue, 'base64')
        headerValue = decoded.toString('ascii')
    }
    var token = await getConfigFromToken(headerValue, route)
    if (!token) {
        log.info({ message: "User tried to use invalid token", context: { token: headerValue, route } })
        return null
    }
    var domainIsAllowed = pm.isMatch(route.from, token.valid_domains)
    if (domainIsAllowed) {
        return token
    } else {
        log.info({ message: "User tried to use token for invalid domain", context: { user: token.userId, route } })
        return null
    }
}

export {
    checkAuthHeader
}