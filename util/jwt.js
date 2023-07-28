import jwt from 'jsonwebtoken';
import { getConfig } from '../util/config.js';

// Function to create a JWT from a JSON object
async function createJWT(jsonPayload) {
    const currentConfig = getConfig()
    const token = jwt.sign(jsonPayload, currentConfig.signing_key);
    return token;
}

// Function to decode and validate a JWT
async function decodeJWT(token) {
    try {
        const currentConfig = getConfig()
        const decoded = jwt.verify(token, currentConfig.signing_key);
        return decoded;
    } catch (err) {
        console.log(err);
        return null;
    }
}

export {
    createJWT,
    decodeJWT
};