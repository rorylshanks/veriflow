import log from '../../util/logging.js'
import Cache from 'cache';
import redisHelper from '../../util/redis.js'
import { getConfig } from '../../util/config.js';
import crypto from 'crypto';

const redisClient = redisHelper.getClient()

let idpRedisResponse = new Cache(60 * 1000);

async function runUpdate() {
    return true
}

async function getUserById(id) {
    var idpResponse = idpRedisResponse.get(`veriflow:users:${id}`)
    if (idpResponse) {
        log.trace(`Returning IDP user ${id} from cache`)
        return idpResponse
    } else {
        try {
            log.debug("Cache miss, returning results from Redis")
            var idpResponse = JSON.parse(await redisClient.get(`veriflow:users:${id}`))
            idpRedisResponse.put(`veriflow:users:${id}`, idpResponse)
            return idpResponse
        } catch (error) {
            log.error({ message: "Error getting user by ID", error: error.message })
            return null
        }
    }
}

async function addNewUserFromClaims(claims) {
    var currentConfig = getConfig()
    var userId = claims[currentConfig.idp_provider_user_id_claim]

    var expires = currentConfig.idp_provider_token_claims_user_ttl || 604800 // Default user to be removed from Veriflow after 7 days

    var userData = {
        vfsid: crypto.randomUUID(),
        id: userId,
        mail: claims.email,
        ...claims
    };

    await redisClient.set(`veriflow:users:${userId}`, JSON.stringify(userData))
    await redisClient.expire(`veriflow:users:${userId}`, expires); // expire in 24 hours
}

async function getAllUsers() {
    const keys = await scanKeys('veriflow:users:*');
    const users = [];
    for (const key of keys) {
        const userDataRaw = await redisClient.get(key);
        if (userDataRaw) {
            let userData = JSON.parse(userDataRaw);
            // Extract session ID from key and add it to the session object
            const userId = key.replace('veriflow:users:', '');
            userData.userId = userId;
            users.push(userData);
        }
    }
    return users;
}

// Utility function to use SCAN for fetching keys without blocking the server
async function scanKeys(pattern) {
    let cursor = '0';
    const keys = [];
    do {
        const reply = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
        cursor = reply[0];
        keys.push(...reply[1]);
    } while (cursor !== '0');
    return keys;
}

export default {
    runUpdate,
    getUserById,
    addNewUserFromClaims,
    getAllUsers
};