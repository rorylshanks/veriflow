import ejs from 'ejs';
import path from 'path';
import { getConfig, getRedirectBasepath } from '../util/config.js';
import redisHelper from '../util/redis.js'
import idp from './idp.js';

var redirectBasePath = getRedirectBasepath()

async function renderSessionsPage(req, res) {
    var sessions = await redisHelper.getAllSessions()
    var html = await ejs.renderFile(path.join(process.cwd(), '/views/admin_sessions.ejs'), 
    {
        sessions
    });
    res.send(html)
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
    killSession
}