import axios from 'axios';
import log from '../util/logging.js'

async function checkDynamicBackend(req, res, route) {
    try {
        const dynamicConfig = route.dynamic_backend_config
        const url = dynamicConfig.url
        const headers = dynamicConfig.request_headers
        const body = dynamicConfig.request_body
        body.user = req.session.userId
        const response = await axios.post(url, body, { headers });
        const responseBody = response.body
        const proxyUrl = responseBody.url
        const responseHeaders = responseBody.headers
        log.info({ "action": "dynamicBackendSessionCreated", "url": backendUrl });
        for (let header of responseHeaders) {
            res.set(header.key, header.value)
        }
        if (!proxyUrl) {
            throw new Error("Dynamic backend did not reply with a url. Response is: " + responseBody.toString())
        }
        res.set("X-Veriflow-Dynamic-Backend-Url", proxyUrl)
    } catch (error) {
        log.error({ "action": "createDynamicBackendSessionFailed", "error": error.toString() });
        return false

    }


}

export default {
    checkDynamicBackend
};