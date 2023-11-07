import { Issuer } from 'openid-client';
import { decodeJWT, createJWT } from '../util/jwt.js';
import { getConfig, getRouteForHostname } from '../util/config.js';
import { URL, URLSearchParams } from 'url';
import log from '../util/logging.js'
import authz from './authz.js'
import dynamicBackend from './dynamic-backend.js'
import utils from '../util/utils.js'
import { checkAuthHeader } from './token-auth.js'

function addParamsToUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    return url.toString();
}


/* 
    This function gets called from any Veriflow managed URL, and also veriflow itself, at ./veriflow/verify.
    This function is also called by the forward_auth function of Caddy. For every request that caddy receives, this function
    is called, and the request verified. If the response code is 2xx caddy will allow the request to go to the upstream, otherwise it will send the 
    response from veriflow back to the client.
*/

async function verifyAuth(req, res) {
    try {
        // First contract a URL object that can be parsed for various functions later, and get the current config
        var requestUrl = new URL(`${req.get("X-Forwarded-Proto")}://${req.get("X-Forwarded-Host")}${req.get("X-Forwarded-Path") || ""}`)
        var currentConfig = getConfig()
        // Then get the route-specific configuration for this hostname. Note that currently veriflow only supports per-host routes
        var route = getRouteForHostname(requestUrl.hostname)
        if (!route) {
            log.warn({ message: "No route found for request", host: requestUrl })
            res.status(400).send(`Failed to find route. Click <a href="${requestUrl.href}">here</a> to try again. If it fails again, please try to clear your cookies.`)
            return
        }
        // Veriflow supports token-based auth to bypass the SSo process, and this involves checking if the route is valid
        // and then verifying a specific header 
        if ((route.token_auth_config_file || route.token_auth_dynamic_url) && route.token_auth_header) {
            var userFromToken = await checkAuthHeader(req, res, route)
            if (userFromToken) {
                log.info({ "action": "userIsAuthedViaToken", "user": userFromToken.userId, context: { url: requestUrl, route: route } })
                // The function for bypassing the AuthZ check is special, as it does not add any additional headers
                // as many of the headers that should be added such as the JWT are specific to a user.
                // This function is intentionally limited as even machine accounts should have a "user" created in the directory and access rights granted through that
                if (userFromToken.bypass_authz_check) {
                    log.info({ "action": "tokenAuthAllowedWithAuthZBypass", context: { userFromToken, route } })
                    res.status(200).send("OK - Token")
                    return
                }
                req.session.loggedin = true
                req.session.userId = userFromToken.userId
                req.session.tokenAuth = true

                if (route.dynamic_backend_config) {
                    req.session.bypass_dynamic_backend = userFromToken.bypass_dynamic_backend
                }
            }
        }
        // If the user is logged in, authorize that the user is allowed to access the specific domain before returning
        if (req.session.loggedin) {
            let userIsAuthz = await authz.authZRequest(req, res, route)
            if (!userIsAuthz) {
                res.status(401).send("User is not authorized to access this route.")
                return
            }
            // If user is AuthN and AuthZ, check dynamic backend config
            if (route.dynamic_backend_config) {
                if (req.session.bypass_dynamic_backend) {
                    let proxyUrl = utils.urlToCaddyUpstream(route.to)
                    res.set("X-Veriflow-Dynamic-Backend-Url", proxyUrl)
                } else {
                    const backend = await dynamicBackend.checkDynamicBackend(req, res, route)
                    if (!backend) {
                        res.status(401).send("Problem with dynamic backend. Please ask the administrator.")
                        return
                    }
                }
            }
            res.status(200).send(userIsAuthz)
            return
        }
        // CORS Preflight request handling
        if (route.cors_allow_preflight && req.get("X-Forwarded-Method") == "OPTIONS") {
            log.info({ "action": "corsPreflightRequestAllowed", context: req.headers })
            res.status(200).send("OK - OPTIONS")
            return
        }

        // Finally, if the user is not logged in and has no other auth methods, create a JWT containging the original requested
        // URL, and redirect them to the AuthN flow for veriflow

        let jwtPayload = {
            protocol: req.get('X-Forwarded-Proto') || "http",
            host: req.get('Host'),
            path: req.get('X-Forwarded-Path'),
            query: req.get('X-Forwarded-Query')
        }
        var redirectBasePath = currentConfig.redirect_base_path || "/.veriflow"
        if (jwtPayload.path == redirectBasePath + "/verify") {
            jwtPayload.path = "/"
            jwtPayload.query = ""
        }
        var signedJwt = await createJWT(jwtPayload)
        var params = {
            token: signedJwt
        }
        let redirectUrl = addParamsToUrl(currentConfig.service_url + redirectBasePath + "/auth", params)
        res.redirect(redirectUrl)
    } catch (error) {
        log.error({ message: "Unknown error occurred in verifyAuth", context: { error: error.message, stack: error.stack } })
        res.status(500).send(`Unknown error occoured. Please try to access the original URL again, do not refresh the page. If it fails again, please try to clear your cookies.`)

    }
}


/* 
    This has the function of being available on every domain, and is therefore used to set a domain specific session cookie, with 
    a user ID, which is used to authZ the request. 

    The session cookie is only set when a query string param "token" is set, and is a valid signed JWT from Veriflow itself. 

    Veriflow will attach this token during the SSO AuthN flow described in the two functions underneath verifyAuth
 */
async function setSessionCookie(req, res) {
    try {
        // First get the current config
        var currentConfig = getConfig()
        // If the request contains a token param, verify it, and log the user in by setting a session variable.
        // Finally, redirect the user to the originally requested URL, which was also specified in the JWT
        if (req.query.token) {
            var decoded = await decodeJWT(req.query.token)
            if (!decoded) {
                log.error({ message: "Failed to decode JWT", context: { jwt: req.query.token } })
                res.sendStatus(500)
                return
            }

            req.session.loggedin = true
            req.session.userId = decoded.userId;

            var redirectProtocol = decoded.protocol
            var redirectHost = decoded.host
            var redirectPath = decoded.path
            var redirectQuery = decoded.query

            var redirectBasePath = currentConfig.redirect_base_path || "/.veriflow"
            if (redirectPath == redirectBasePath + "/set") {
                redirectPath = "/"
                redirectQuery = {}
            }
            var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
            let redirectUrl = addParamsToUrl(baseUrl, redirectQuery)
            res.redirect(redirectUrl);
            return
        } else {
            res.status(400).send("No token included in request")
        }

    } catch (error) {
        log.error({ message: "Unknown error occurred in verifyAuth", context: { error: error.message, stack: error.stack } })
        res.status(500).send(`Unknown error occoured. Please try to access the original URL again, do not refresh the page. If it fails again, please try to clear your cookies.`)

    }
}

/* 
    This function handles the initial redirect to the OIDC provider.
    It must be initiated by a redirect from the verify endpoint
*/

async function redirectToSsoProvider(req, res) {
    try {
        if (!req.query.token) {
            res.status(400).json({ "error": "Request must include token" })
            return
        }
        // FIXME: Verify that redirect URL is allowed in config
        var redirectToken = await decodeJWT(req.query.token)

        if (!redirectToken) {
            res.status(500)
            return
        }

        var currentConfig = getConfig()
        var redirectBasePath = currentConfig.redirect_base_path || "/.veriflow"

        if (req.session.loggedin) {
            let jwtPayload = {
                protocol: redirectToken.protocol,
                host: redirectToken.host,
                path: redirectToken.path,
                query: redirectToken.query,
                userId: req.session.userId
            }
            var signedJwt = await createJWT(jwtPayload)

            var redirectProtocol = redirectToken.protocol
            var redirectHost = redirectToken.host
            var redirectPath = redirectBasePath + "/set"
            var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
            var redirectParams = {
                token: signedJwt
            }
            var redirectUrl = addParamsToUrl(baseUrl, redirectParams)

            res.redirect(redirectUrl);
            return;
        }

        req.session.redirect = redirectToken

        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + redirectBasePath + "/callback"],
            response_types: ['code']
        });

        var redirectUrl = oauth_client.authorizationUrl({
            scope: currentConfig.idp_provider_scope,
        });
        res.redirect(redirectUrl)
    } catch (error) {
        log.error({ message: "Unknown error occoured in redirectToSsoProvider", context: { error: error.message, trace: error.stack } })
        res.sendStatus(500)
    }

}


async function verifySsoCallback(req, res) {
    try {

        var currentConfig = getConfig()
        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)
        var redirectBasePath = getConfig().redirect_base_path || "/.veriflow"

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + redirectBasePath + "/callback"],
            response_types: ['code']
        });

        const params = oauth_client.callbackParams(req);
        var callbackInfo = await oauth_client.callback(currentConfig.service_url + redirectBasePath + "/callback", params)


        // var userInfo = await oauth_client.userinfo(callbackInfo.access_token)
        var userIdClaim = callbackInfo.claims()[currentConfig.idp_provider_user_id_claim]

        if (!userIdClaim) {
            log.warn({ error: "User does not have a userId included in the ID token claims. Check setting idp_provider_user_id_claim", claims: callbackInfo.claims() })
            res.status(401).json({ error: "User does not have a userId included in the ID token claims" })
            return
        }

        req.session.loggedin = true;
        req.session.userId = userIdClaim;

        let jwtPayload = {
            protocol: req.session.redirect.protocol,
            host: req.session.redirect.host,
            path: req.session.redirect.path,
            query: req.session.redirect.query,
            userId: userIdClaim
        }
        var signedJwt = await createJWT(jwtPayload)

        var redirectProtocol = req.session.redirect.protocol
        var redirectHost = req.session.redirect.host
        var redirectPath = redirectBasePath + "/set"
        var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
        var redirectParams = {
            token: signedJwt
        }
        var redirectUrl = addParamsToUrl(baseUrl, redirectParams)

        res.redirect(redirectUrl);

    } catch (error) {
        log.error({ message: "Unknown error occoured in verifySsoCallback", context: { error: error.message, trace: error.stack } })
        res.sendStatus(500)
    }
}

export default {
    verifySsoCallback,
    redirectToSsoProvider,
    verifyAuth,
    setSessionCookie
};