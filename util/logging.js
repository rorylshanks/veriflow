import pino from 'pino';

const log = pino();

log.level = 10

log.access = (action, route, user, req) => {
    let method = req.get("X-Forwarded-Method")
    let path = req.get("X-Forwarded-Path")
    let query = req.get("X-Forwarded-Query")
    let uri = req.get("X-Forwarded-Uri")
    let proto = req.get("X-Forwarded-Proto")
    let host = req.get("X-Forwarded-Host")
    let ip = req.get("X-Forwarded-For")
    let userInfo = {}
    if (user) {
        userInfo.id = user.id
        userInfo.mail = user.mail
    }
    log.info({
        action: action,
        request: {
            method,
            path,
            query,
            proto,
            host,
            uri,
            ip
        },
        user: userInfo,
        route: {
            from: route.from.toString(),
            to: route.to.toString()
        }
    })

}

export default log;