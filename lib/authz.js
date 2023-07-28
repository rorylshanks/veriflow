import redis from 'redis';
import Bossbat from 'bossbat';
import adapter from './idp_adapters/msgraph.js'
import log from '../util/logging.js'

const redisClient = redis.createClient({
    url: 'redis://' + process.env.REDIS_HOST
});

const idpUpdater = new Bossbat({
    connection: { host: process.env.REDIS_HOST, port: 6379 },
    prefix: 'bossbat:',
});

redisClient.on('error', (err) => {
    log.error('Redis error: ', err);
});

async function update() {
    return new Promise(async (resolve, reject) => {
        try {
            var update = await adapter.runUpdate()
            await redisClient.connect()
            await redisClient.set('veriflow:users', JSON.stringify(update));
            await redisClient.disconnect();
            resolve()
        } catch (error) {
            log.error(error)
            reject()
        }

    })

}

async function scheduleUpdate() {
    try {
        await update()
    } catch (error) {
        log.error({message: "Failed up update users and groups from IDP", error})
    }

    // idpUpdater.hire('update', {
    //     every: '10 minutes',
    //     work: () => {
    //         update()
    //     },
    // });
    // idpUpdater.demand('update');
}

async function authZRequest(req, res) {

}

async function checkUserGroupMembership(user, groups) {

}

export default {
    scheduleUpdate,
    authZRequest
}