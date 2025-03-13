import { Issuer } from 'openid-client';
import { decodeJWT, createJWT } from '../util/jwt.js';
import { getConfig, getRouteFromRequest, getRedirectBasepath, getExternalAuthRouteFromHostname } from '../util/config.js';
import { URL, URLSearchParams } from 'url';
import log from '../util/logging.js'
import authz from './authz.js'
import dynamicBackend from './dynamic-backend.js'
import { checkAuthHeader } from './token-auth.js'
import crypto from 'crypto'
import errorpages from '../util/errorpage.js'
import idp from './idp.js'
import bcrypt from 'bcryptjs'

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
        var requestUrl = new URL(`${req.headers["x-forwarded-proto"]}://${req.headers["x-forwarded-host"]}${req.headers["x-forwarded-path"] || ""}`)
        var currentConfig = getConfig()
        // Then get the route-specific configuration for this hostname. Note that currently veriflow only supports per-host routes
        var route = getRouteFromRequest(req)
        if (!route) {
            log.warn({ message: "No route found for request", host: requestUrl })
            var html = await errorpages.renderErrorPage(404, null, req)
            res.status(404).send(html)
            return
        }
        if (route.allow_public_unauthenticated_access === true) {
            log.access("unauthenticatedAccessAllowedDueToRouteConfig", route, null, req)
            res.status(200).send("OK - Public")
            return
        }
        // Veriflow supports token-based auth to bypass the SSo process, and this involves checking if the route is valid
        // and then verifying a specific header 
        if ((route.token_auth_config_file || route.token_auth_dynamic_config) && route.token_auth_header) {
            var configFromToken = await checkAuthHeader(req, res, route)
            if (configFromToken) {
                // If the user is authenticated via a token, set all the sso variables that are required
                // If the request is authenticated using a machine token, make sure to also specify machine_token as true 
                // in the session as this will allow the AuthZ function to work properly
                if (configFromToken.bypass_authz_check === true || configFromToken.machine_token === true) {
                    req.session.machine_token = true
                    req.session.token = configFromToken
                }
                req.session.loggedin = true
                req.session.userId = configFromToken.userId
                req.session.tokenAuth = true
                log.access("userIsAuthedViaToken", route, null, req)
            }
        }
        // If the user is logged in, authorize that the user is allowed to access the specific domain before returning
        if (req.session.loggedin) {
            let userIsAuthz = await authz.authZRequest(req, res, route)
            if (!userIsAuthz) {
                var html = await errorpages.renderErrorPage(403, null, req)
                res.status(403).send(html)
                return
            }
            // If user is AuthN and AuthZ, check dynamic backend config
            if (route.to.source == "veriflow_dynamic") {
                const backend = await dynamicBackend.checkDynamicBackend(req, res, route, requestUrl)
                if (!backend) {
                    var html = await errorpages.renderErrorPage(500, "ERR_DYNAMIC_BACKEND_FAILED", req)
                    res.status(500).send(html)
                    return
                }
            }
            res.status(200).send(userIsAuthz)
            return
        }
        // CORS Preflight request handling
        if (route.cors_allow_preflight && req.get("X-Forwarded-Method") == "OPTIONS") {
            log.access("corsPreflightRequestAllowed", route, null, req)
            res.status(200).send("OK - OPTIONS")
            return
        }

        // In the case where there is external auth enabled, we need to send a 401 as nginx ingress will handle the redirect
        if (route.allow_external_auth === true && !req.query.rd) {
            res.status(401).send("401 - external_auth")
            return
        }

        // Finally, if the user is not logged in and has no other auth methods, create a JWT containging the original requested
        // URL, and redirect them to the AuthN flow for veriflow

        let jwtPayload = {
            protocol: req.headers['x-forwarded-proto'] || "http",
            host: req.headers['x-forwarded-host'],
            path: req.headers['x-forwarded-path'],
            query: req.headers['x-forwarded-query']
        }
        var redirectBasePath = getRedirectBasepath()

        // handle edge case where requested redirect URL is itself
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
        var html = await errorpages.renderErrorPage(500, "ERR_AUTH_FAILED", req)
        res.status(500).send(html)
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
        // If the request contains a token param, verify it, and log the user in by setting a session variable.
        // Finally, redirect the user to the originally requested URL, which was also specified in the JWT
        if (req.query.token) {
            var decoded = await decodeJWT(req.query.token)
            if (!decoded) {
                log.error({ message: "Failed to decode JWT", context: { jwt: req.query.token } })
                var html = await errorpages.renderErrorPage(500, "ERR_SET_INVALID_JWT", req)
                res.status(500).send(html)
                return
            }

            let userId = decoded.userId

            // Now we compare the challenge hash from the token with the challenge from the IdP
            // To limit impact of user impersonation in the event of a stolen signing key
            let userFromIdp = await idp.getUserById(userId)
            let veriflowUserSpecificSecurityChallenge = userFromIdp?.vfsid
            if (veriflowUserSpecificSecurityChallenge) {
                let hashToCompare = decoded.challengeHash

                let challengeHashResult = await bcrypt.compare(veriflowUserSpecificSecurityChallenge, hashToCompare)
    
                if (!challengeHashResult) {
                    log.error({ error: "User failed challengeHash", token: decoded })
                    req.session.destroy()
                    throw new Error("Challenge hash failed")
                }
            }


            req.session.loggedin = true
            req.session.userId = decoded.userId;
            await addSessionDetails(req)
            req.session.details.parent_session_id = decoded.parentSession
            // This sets the cookie for the accessed domain to expire at the same time as the "main" veriflow cookie, to 
            // prevent a user from being deauthenticated from Veriflow, but still authenticated on the subdomains. 
            var expireDate = false
            try {
                var date = new Date(decoded.cookieExpires)
                // This function checks if the date is actually a date, as JS does not
                // throw an error when trying to aprse an invalid date
                if(date == "Invalid Date") {
                    throw new Error
                }
                expireDate = date
            } catch (error) {
                log.error({ message: "Unable to get cookie expiry from decoded date", context: decoded})
            }
            
            req.session.cookie.expires = expireDate

            if (req.session.external_auth === true) {
                res.status(200).send("OK - Set")
                return
            }

            var redirectProtocol = decoded.protocol
            var redirectHost = decoded.host
            var redirectPath = decoded.path
            var redirectQuery = decoded.query

            var redirectBasePath = getRedirectBasepath()
            if (redirectPath == redirectBasePath + "/set") {
                redirectPath = "/"
                redirectQuery = {}
            }
            var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
            let redirectUrl = addParamsToUrl(baseUrl, redirectQuery)
            res.redirect(redirectUrl);
            return
        } else {
            var html = await errorpages.renderErrorPage(400, "ERR_SET_NO_TOKEN", req)
            res.status(400).send(html)
        }

    } catch (error) {
        log.error({ message: "Unknown error occurred in setSessionCookie", context: { error: error.message, stack: error.stack } })
        var html = await errorpages.renderErrorPage(500, "ERR_SET_FAILED", req)
        res.status(500).send(html)
    }
}

/* 
    This function handles the initial redirect to the OIDC provider.
    It must be initiated by a redirect from the verify endpoint
*/

async function redirectToSsoProvider(req, res) {
    try {
        if (!req.query.token) {
            var html = await errorpages.renderErrorPage(400, "ERR_REDIRECT_NO_TOKEN", req)
            res.status(400).send(html)
            return
        }
        
        var redirectToken = await decodeJWT(req.query.token)

        if (!redirectToken) {
            var html = await errorpages.renderErrorPage(400, "ERR_REDIRECT_BAD_TOKEN", req)
            res.status(400).send(html)
            return
        }

        var currentConfig = getConfig()
        var redirectBasePath = getRedirectBasepath()

        // FIXME: Verify that redirect URL is allowed in config
        req.session.redirect = redirectToken

        // If the user is already logged in to veriflow, do not re-initiate the IdP login flow, rather
        // just authenticate the user and send them on their way
        if (req.session.loggedin) {
            await handleRedirectToSetEndpoint(req, res)
            return
        }

        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + redirectBasePath + "/callback"],
            response_types: ['code']
        });

        let randomState = crypto.randomBytes(20).toString('hex');

        req.session.oauth_state = randomState

        var redirectUrl = oauth_client.authorizationUrl({
            scope: currentConfig.idp_provider_scope,
            state: randomState
        });
        res.redirect(redirectUrl)
    } catch (error) {
        log.error({ message: "Unknown error occoured in redirectToSsoProvider", context: { error: error.message, trace: error.stack } })
        var html = await errorpages.renderErrorPage(500, "ERR_REDIRECT_FAILED", req)
        res.status(500).send(html)
    }

}


async function verifySsoCallback(req, res) {
    try {
        var currentConfig = getConfig()
        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)
        var redirectBasePath = getRedirectBasepath()

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + redirectBasePath + "/callback"],
            response_types: ['code']
        });

        const params = oauth_client.callbackParams(req);
        var callbackInfo = await oauth_client.callback(currentConfig.service_url + redirectBasePath + "/callback", params, { state: req.session.oauth_state })


        // var userInfo = await oauth_client.userinfo(callbackInfo.access_token)
        var userClaims = callbackInfo.claims()
        var userIdClaim = userClaims[currentConfig.idp_provider_user_id_claim]

        if (!userIdClaim) {
            log.warn({ error: "User does not have a userId included in the ID token claims. Check setting idp_provider_user_id_claim", claims: userClaims })
            var html = await errorpages.renderErrorPage(500, "ERR_NO_USERID_IN_TOKEN", req)
            res.status(500).send(html)
            return
        }

        await idp.addNewUserFromClaims(userClaims)

        let userFromIdp = await idp.getUserById(userIdClaim)

        if (!userFromIdp) {
            log.warn({ error: "User does not exist in IdP", claims: userClaims })
            req.session.destroy()
            var html = await errorpages.renderErrorPage(403, "ERR_USER_NOT_IN_IDP", req)
            res.status(403).send(html)
            return
        }

        req.session.loggedin = true;
        req.session.userId = userIdClaim;

        await handleRedirectToSetEndpoint(req, res)

    } catch (error) {
        log.error({ message: "Unknown error occoured in verifySsoCallback", context: { error: error.message, trace: error.stack } })
        var auth_retries = req.session.auth_retries
        if (!auth_retries || auth_retries <= 3) {
            var protocol = req.session.redirect.protocol
            var host = req.session.redirect.host
            var path = req.session.redirect.path
            var query = req.session.redirect.query
            var baseUrl = new URL(`${protocol}://${host}${path}`)
            var redirectUrl = addParamsToUrl(baseUrl, query)
            if (!auth_retries) {
                req.session.auth_retries = 1
            } else {
                req.session.auth_retries++
            }
            log.info({ message: `Retrying auth for user... Retry attempt ${req.session.auth_retries}... Redirecting back to original requested URL ${redirectUrl}` })
            res.redirect(redirectUrl)
            return
        }
        var html = await errorpages.renderErrorPage(500, "ERR_CALLBACK_FAILED", req, req.session.redirect.host)
        res.status(500).send(html)
    }
}

async function handleRedirectToSetEndpoint(req, res) {
    var redirectBasePath = getRedirectBasepath()
    let userId = req.session.userId
    let userFromIdp = await idp.getUserById(userId)
    let veriflowUserSpecificSecurityChallenge = userFromIdp?.vfsid
    let challengeHash = null

    if (userFromIdp && veriflowUserSpecificSecurityChallenge) {
        challengeHash = await bcrypt.hash(veriflowUserSpecificSecurityChallenge, 5)
    }

    await addSessionDetails(req)

    // Generate a hash of the vfsid of the user stored in redis, to limit issue of user impersonation
    // when the signing key is stolen
    

    let jwtPayload = {
        protocol: req.session.redirect.protocol,
        host: req.session.redirect.host,
        path: req.session.redirect.path,
        query: req.session.redirect.query,
        userId: userId,
        cookieExpires: req.session.cookie.expires,
        parentSession: req.sessionID,
        challengeHash: challengeHash
    }
    var signedJwt = await createJWT(jwtPayload)

    var redirectProtocol = req.session.redirect.protocol
    var redirectHost = req.session.redirect.host
    var redirectPath = redirectBasePath + "/set"
    var redirectParams = {
        token: signedJwt
    }

    if (req.session.external_auth === true) {
        redirectPath = req.session.redirect.path
        redirectParams = Object.assign(redirectParams, req.session.redirect.query)
    }
    
    var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`

    var redirectUrl = addParamsToUrl(baseUrl, redirectParams)
    res.redirect(redirectUrl);
}

async function addSessionDetails(req) {
    req.session.details = {
        user_agent: req.get("user-agent"),
        remote_ip: req.ip,
        original_host: req.get('x-forwarded-host')
    }
}

async function externalAuthVerify(req, res) {
    var originalUrl = req.get("x-original-url") || req.query.rd
    if (!originalUrl) {
        log.error({ message: "x-original-url or redirect query not specified when using external_auth"})
        var html = await errorpages.renderErrorPage(500, "ERR_NO_ORIGINAL_URL_SPECIFIED", req)
        res.status(500).send(html)
        return
    }
    try {
        var parsedUrl = new URL(originalUrl)
        var policy = getExternalAuthRouteFromHostname(parsedUrl.hostname)
        if (!policy) {
            log.error({ message: "no route found for specified redirect URL, or route not enabled for external auth" })
            var html = await errorpages.renderErrorPage(404, "ERR_NO_ROUTE_FOUND", req)
            res.status(500).send(html)
            return
        }
        req.headers["x-veriflow-route-id"] = policy.routeId
        req.headers["x-forwarded-proto"] = parsedUrl.protocol.slice(0, -1)
        req.headers["x-forwarded-host"] = parsedUrl.hostname
        req.headers["x-forwarded-path"] = parsedUrl.pathname
        req.query.token = parsedUrl.searchParams.get("token")
        req.session.external_auth = true

        if (req.query.token) {
            // Handle the case where, when the user has logged in to the IdP, veriflow will redirect the user to the original URL, with a token added 
            // to the query string. If this token exists, take it and process it to set the session cookie for the users session
            setSessionCookie(req, res)
        } else {
            // If the user is not authed on the nginx, they will get redirected to veriflow, with an "rd" in the query string
            // Handle the case here, that the user is already authenticated in veriflow and just needs to have the cookie set again
            if (req.session.loggedin && req.query.rd) {
                // redirect to set endpoint
                req.session.redirect = {
                    protocol: parsedUrl.protocol.slice(0, -1),
                    host: parsedUrl.hostname,
                    path: parsedUrl.pathname,
                    query: parsedUrl.search
                }
                handleRedirectToSetEndpoint(req, res)
            } else {
                // When the user has a session on the proxied URL, simply AuthZ the request
                verifyAuth(req, res)
            }
            
        }
        
        
    } catch (error) {
        log.error({ message: "unknown error in externalAuthVerify", context: { error: error.message, trace: error.stack } })
        var html = await errorpages.renderErrorPage(500, "ERR_INTERNAL_SERVER_ERROR", req)
        res.status(500).send(html)
    }
    
}

export default {
    verifySsoCallback,
    redirectToSsoProvider,
    verifyAuth,
    setSessionCookie,
    externalAuthVerify
};