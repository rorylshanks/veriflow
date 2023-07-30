import { Issuer } from 'openid-client';
import { decodeJWT, createJWT } from '../util/jwt.js';
import { getConfig, getRouteForHostname } from '../util/config.js';
import { URL, URLSearchParams } from 'url';
import log from '../util/logging.js'
import authz from './authz.js'

function addParamsToUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    url.search = new URLSearchParams(params).toString();
    return url.toString();
}

async function verifyAuth(req, res) {
    try {
        if (req.session.loggedin) {
            authz.authZRequest(req, res)
            return
        }
        if (req.get("X-Forwarded-Method") == "OPTIONS") {
            var requestHost = new URL(`${req.get("X-Forwarded-Protocol")}://${req.get("X-Forwarded-Host")}`)
            var route = getRouteForHostname(requestHost.hostname)
            console.log(route)
            if (route.cors_allow_preflight) {
                log.info({"action": "corsPreflightRequestAllowed", context: req.headers})
                res.send(200)
                return
            }
        }
        var currentConfig = getConfig()
        if (req.query.token) {
            var decoded = await decodeJWT(req.query.token)
            if (!decoded) {
                res.send(500)
                return
            }

            req.session.loggedin = true
            req.session.userId = decoded.userId;

            var redirectProtocol = decoded.protocol
            var redirectHost = decoded.host
            var redirectPath = decoded.path
            var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
            let redirectUrl = addParamsToUrl(baseUrl, decoded.query)
            res.redirect(redirectUrl);
            return
        }

        let jwtPayload = {
            protocol: req.get('X-Forwarded-Protocol') || "http",
            host: req.get('Host'),
            path: req.get('X-Forwarded-Path'),
            query: req.get('X-Forwarded-Query')
        }
        if (jwtPayload.path == "/.veriflow/verify") {
            jwtPayload.path = "/"
            jwtPayload.query = ""
        }
        var signedJwt = await createJWT(jwtPayload)
        var params = {
            token: signedJwt
        }
        let redirectUrl = addParamsToUrl(currentConfig.service_url + "/.veriflow/auth", params)
        res.redirect(redirectUrl)
    } catch (error) {
        res.send(500)
    }
}

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
        req.session.redirect = redirectToken

        if (req.session.loggedin) {
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
            var redirectPath = "/.veriflow/verify"
            var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
            var redirectParams = {
                token: signedJwt
            }
            var redirectUrl = addParamsToUrl(baseUrl, redirectParams)

            res.redirect(redirectUrl);
        }

        var currentConfig = getConfig()
        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + "/.veriflow/callback"],
            response_types: ['code']
        });

        var redirectUrl = oauth_client.authorizationUrl({
            scope: currentConfig.idp_provider_scope,
        });
        res.redirect(redirectUrl)
    } catch (error) {
        log.error(error)
        res.send(500)
    }

}


async function verifySsoCallback(req, res) {
    try {

        var currentConfig = getConfig()
        var oauthIssuer = await Issuer.discover(currentConfig.idp_provider_url)

        var oauth_client = new oauthIssuer.Client({
            client_id: currentConfig.idp_client_id,
            client_secret: currentConfig.idp_client_secret,
            redirect_uris: [currentConfig.service_url + "/.veriflow/callback"],
            response_types: ['code']
        });

        const params = oauth_client.callbackParams(req);
        var callbackInfo = await oauth_client.callback(currentConfig.service_url + "/.veriflow/callback", params)


        // var userInfo = await oauth_client.userinfo(callbackInfo.access_token)
        var userIdClaim = callbackInfo.claims()[currentConfig.idp_provider_user_id_claim]

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
        var redirectPath = "/.veriflow/verify"
        var baseUrl = `${redirectProtocol}://${redirectHost}${redirectPath}`
        var redirectParams = {
            token: signedJwt
        }
        var redirectUrl = addParamsToUrl(baseUrl, redirectParams)

        res.redirect(redirectUrl);

    } catch (error) {
        console.error(error)
        res.send(500)
    }
}

export default {
    verifySsoCallback,
    redirectToSsoProvider,
    verifyAuth
};