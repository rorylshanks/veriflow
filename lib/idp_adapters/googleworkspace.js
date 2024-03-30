import fs from 'fs';
import log from '../../util/logging.js';
import {GoogleAuth} from 'google-auth-library';
import { getConfig } from '../../util/config.js';
import Cache from 'cache';
import redisHelper from '../../util/redis.js'
import crypto from 'crypto';

const redisClient = redisHelper.getClient()

let idpRedisResponse = new Cache(60 * 1000);

async function getAccessToken() {
    const config = getConfig()
    const auth = new GoogleAuth({
        keyFile: config.idp_service_account_json_file,
        scopes: [
            'https://www.googleapis.com/auth/admin.directory.user.readonly',
            'https://www.googleapis.com/auth/admin.directory.group.readonly'
        ],
        subject: config.idp_service_account_subject,
        clientOptions : {
            subject : config.idp_service_account_subject
        }
    });

    const client = await auth.getClient();
    client.subject = config.idp_service_account_subject;
    return client
}

async function getUsers(client) {
    const config = getConfig()
    const response = await client.request({url: `https://admin.googleapis.com/admin/directory/v1/users?domain=${config.idp_tenant_id}&maxResults=500`});
    log.info(`Found ${response.data.users.length} users in domain`)
    return response.data.users;
}

async function getUserGroups(client, userEmail) {
    const response = await client.request({ url : `https://admin.googleapis.com/admin/directory/v1/groups?userKey=${userEmail}`});
    return response.data.groups;
}

async function getUsersAndGroups() {
    const client = await getAccessToken();
    const users = await getUsers(client);

    let userData = {};
    for (const user of users) {
        log.info(`Requesting groups for user ${user.primaryEmail}`)
        const groups = await getUserGroups(client, user.primaryEmail);
        userData[user.primaryEmail] = {
            vfsid: crypto.randomUUID(),
            displayName: user.name.fullName,
            givenName: user.name.givenName,
            preferredLanguage: user.language || 'en',
            surname: user.name.familyName,
            userPrincipalName: user.primaryEmail,
            mail: user.primaryEmail,
            id: user.primaryEmail,
            groups: groups ? groups.map(group => group.name) : []
        };
    }

    return userData;
}

async function runUpdate() {
    log.debug("Starting update of users and groups from Google Workspace");
    const userData = await getUsersAndGroups();
    fs.writeFileSync("output.json", JSON.stringify(userData, null, 2));
    await redisClient.set('veriflow:users', JSON.stringify(update));
    log.debug("Finished update of users and groups from Google Workspace");
    return true
}

async function getIdpConfig() {
    var idpResponse = idpRedisResponse.get("veriflow:users")
    if (idpResponse) {
        log.trace("Returning IDP users from cache")
        return idpResponse
    } else {
        try {
            log.debug("Cache miss, returning results from Redis")
            var idpResponse = JSON.parse(await redisClient.get('veriflow:users'))
            idpRedisResponse.put("veriflow:users", idpResponse)
            return idpResponse
        } catch (error) {
            log.error(error)
            return null
        }

    }
}

async function getUserById(id) {
    var config = await getIdpConfig()
    if (!config) {
        return null
    }
    return config[id]
}

async function getAllUsers() {
    var config = await getIdpConfig()
    return config
}

export default { 
    runUpdate,
    getUserById,
    getAllUsers
};
