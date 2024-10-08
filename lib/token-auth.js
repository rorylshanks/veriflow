import fs from 'fs/promises'
import Cache from 'cache';
import log from '../util/logging.js'
import axios from 'axios';

let tokenHeaderCache = new Cache(60 * 1000);

async function getConfigFromToken(token, route) {
    var tokenConfig = tokenHeaderCache.get(`${token}-${route}`)
    if (tokenConfig) {
        log.trace("Returning tokenConfig from cache")
        return tokenConfig
    } else {
        try {
            if (route.token_auth_config_file) {
                log.debug("Cache miss, returning results from file " + route.token_auth_config_file)
                var tokenConfig = JSON.parse(await fs.readFile(route.token_auth_config_file))
                if (tokenConfig[token]) {
                    tokenHeaderCache.put(`${token}-${route}`, tokenConfig[token])
                    return tokenConfig[token]
                }
            }
            
            if (route.token_auth_dynamic_config) {
                let dynamicUrl = route.token_auth_dynamic_config.url
                let headers = route.token_auth_dynamic_config.headers || {}
                let postBody = {
                    token
                }
                log.debug("Cache miss, returning results from url " + dynamicUrl)

                const token_auth_response = await axios.post(dynamicUrl, postBody, { headers });
                if (token_auth_response.data) {
                    log.debug("Received response from dynamic token backend " + token_auth_response.data)
                    tokenHeaderCache.put(`${token}-${route}`, token_auth_response.data)
                    return token_auth_response.data
                }
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
        log.debug({ message: "Auth header has no value to check, returning", context: { from: route.from } })
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
        log.infoWithContext(req, { message: "User tried to use invalid token", context: { token: headerValue, route } })
        return null
    } else {
        return token
    }

}

export {
    checkAuthHeader
}