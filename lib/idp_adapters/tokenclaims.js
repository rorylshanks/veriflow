import log from '../../util/logging.js'
import Cache from 'cache';
import redisHelper from '../../util/redis.js'
import { getConfig } from '../../util/config.js';

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

    var userData = {
        id: userId,
        mail: claims.email,
        ...claims
    };

    await redisClient.set(`veriflow:users:${userId}`, JSON.stringify(userData))
    await redisClient.expire(`veriflow:users:${userId}`, 87000); // expire in 24 hours
}

export default {
    runUpdate,
    getUserById,
    addNewUserFromClaims
};