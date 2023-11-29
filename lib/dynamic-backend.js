import axios from 'axios';
import log from '../util/logging.js'
import utils from '../util/utils.js'

async function checkDynamicBackend(req, res, route, requestUrl) {
    try {
        const dynamicConfig = route.to
        const url = dynamicConfig.url
        const headers = dynamicConfig.request_headers
        const body = dynamicConfig.request_body
        body.user = req.session.userId
        body.original_headers = req.headers
        const response = await axios.post(url, body, { headers });
        const responseBody = response.data
        const proxyUrl = responseBody.url
        const responseHeaders = responseBody.headers
        log.info({ "action": "dynamicBackendSessionOk", "url": responseBody });
        for (let header of responseHeaders) {
            res.set(header.key, header.value)
        }
        if (!proxyUrl) {
            throw new Error("Dynamic backend did not reply with a url. Response is: " + responseBody.toString())
        }
        res.set("X-Veriflow-Dynamic-Backend-Url", utils.urlToCaddyUpstream(proxyUrl))
        return true
    } catch (error) {
        log.error({ "action": "createDynamicBackendSessionFailed", "error": error.toString() });
        return false

    }


}

export default {
    checkDynamicBackend
};