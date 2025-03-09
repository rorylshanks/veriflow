import jwt from 'jsonwebtoken';
import { getConfig } from '../util/config.js';
import log from './logging.js';

// Function to create a JWT from a JSON object
async function createJWT(jsonPayload) {
    const currentConfig = getConfig()
    try {
        var key = Buffer.from(currentConfig.signing_key, 'base64')
        var serviceUrl = new URL(currentConfig.service_url)
        const token = jwt.sign(jsonPayload, key, { 
            algorithm: currentConfig.signing_key_algorithm || "RS256",
            keyid: currentConfig.kid_override || "0",
            expiresIn: currentConfig.jwt_issuer_expires_in || "10s",
            issuer: serviceUrl.hostname
        });
        return token;
    } catch (error) {
        log.error({ message: "Failed to sign JWT", context: { payload: JSON.stringify(jsonPayload), error: error.message } })
    }

}

// Function to decode and validate a JWT
async function decodeJWT(token) {
    try {
        const currentConfig = getConfig()
        var key = Buffer.from(currentConfig.signing_key, 'base64')
        const decoded = jwt.verify(token, key);
        return decoded;
    } catch (error) {
        log.error({ message: "Failed to decode JWT", context: { jwt: token, error: error.message } });
        return null;
    }
}

export {
    createJWT,
    decodeJWT
};