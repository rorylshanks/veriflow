import ejs from 'ejs';
import path from 'path';
import { getConfig, getRedirectBasepath } from '../util/config.js';
import redisHelper from '../util/redis.js'
import idp from './idp.js';
import errorpages from '../util/errorpage.js'
import { decodeJWT, createJWT } from '../util/jwt.js';
import log from '../util/logging.js'
import authz from './authz.js'

var redirectBasePath = getRedirectBasepath()

const route =  {
    from: "ADMIN_INTERNAL",
    to: "ADMIN_INTERNAL"
}

async function verifyAdminJwt(req, res, next) {
    try {
        var jwt = req.get("X-Veriflow-Admin-Jwt")
        var decodedJwt = await decodeJWT(jwt)
        if (!jwt || !decodedJwt) {
            var html = await errorpages.renderErrorPage(403, null, req)
            log.access("invalidJwtUsedToAccessAdminPage", route, jwt, req)
            res.status(403).send(html)
            return
        }
        var allowedGroups = getConfig().admin.allowed_groups
        var foundGroups = await authz.checkUserGroupMembership(decodedJwt, allowedGroups)
        if (foundGroups.length > 0) {
            next()
        } else {
            var html = await errorpages.renderErrorPage(403, null, req)
            log.access("userIsDeniedToAdminPage", route, jwt, req)
            res.status(403).send(html)
            return 
        }
    } catch (error) {
            var html = await errorpages.renderErrorPage(403, null, req)
            log.error({ message: "Unknown error occurred in verifyAdminJwt", context: { error: error.message, stack: error.stack } })
            res.status(403).send(html)
            return
    }
}

async function renderSessionsPage(req, res) {
    try {
        var sessions = await redisHelper.getAllSessions()
        var config = getConfig()
        var logo_image_src = config?.ui?.logo_image_src || false
        var html = await ejs.renderFile(path.join(process.cwd(), '/views/admin_sessions.ejs'), 
        {
            sessions,
            logo_image_src,
            redirectBasePath
        });
        res.send(html)
    } catch (error) {
        var html = await errorpages.renderErrorPage(500, null, req)
        log.error({ message: "Unknown error occurred in renderSessionsPage", context: { error: error.message, stack: error.stack } })
        res.status(500).send(html)
    }

}

async function renderUsersPage(req, res) {
    try {
        var usersObj = await idp.getAllUsers()
        var users = []
        for (var user of Object.keys(usersObj)) {
            users.push(usersObj[user])
        }
        var config = getConfig()
        var logo_image_src = config?.ui?.logo_image_src || false
        var html = await ejs.renderFile(path.join(process.cwd(), '/views/admin_users.ejs'), 
        {
            users,
            logo_image_src,
            redirectBasePath
        });
        res.send(html)
    } catch (error) {
        var html = await errorpages.renderErrorPage(500, null, req)
        log.error({ message: "Unknown error occurred in renderUsersPage", context: { error: error.message, stack: error.stack } })
        res.status(500).send(html)
    }
}

async function renderUserDetailsPage(req, res) {
    try {
        var userId = req.query.id
        if (!userId) {
            res.redirect(redirectBasePath + "/asmin/users")
            return
        }
        var user = structuredClone(await idp.getUserById(userId))
        var userGroups = user.groups
        user.groups = null
        var config = getConfig()
        var logo_image_src = config?.ui?.logo_image_src || false
        var html = await ejs.renderFile(path.join(process.cwd(), '/views/admin_user_details.ejs'), 
        {
            user,
            userGroups,
            logo_image_src,
            redirectBasePath
        });
        res.send(html)
    } catch (error) {
        var html = await errorpages.renderErrorPage(500, null, req)
        log.error({ message: "Unknown error occurred in renderUserDetailsPage", context: { error: error.message, stack: error.stack } })
        res.status(500).send(html)
    }

}

async function killSession(req, res) {
    var sessionId = req.query.id
    if (sessionId) {
        await redisHelper.deleteSession(sessionId)
    }
    res.redirect(redirectBasePath + '/admin/sessions/')
}

export default {
    renderSessionsPage,
    killSession,
    verifyAdminJwt,
    renderUsersPage,
    renderUserDetailsPage
}