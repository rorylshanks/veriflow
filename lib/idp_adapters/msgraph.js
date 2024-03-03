import 'isomorphic-fetch';
import graph from '@microsoft/microsoft-graph-client';
import axios from 'axios';
import FormData from 'form-data';
import pLimit from 'p-limit';
import { getConfig } from '../../util/config.js';
import log from '../../util/logging.js'
import fs from 'fs';
import Cache from 'cache';
import redisHelper from '../../util/redis.js'

const redisClient = redisHelper.getClient()

let idpRedisResponse = new Cache(60 * 1000);

async function getAccessToken(clientId, clientSecret, tenantId) {
    const form = new FormData();
    form.append('client_id', clientId);
    form.append('client_secret', clientSecret);
    form.append('scope', 'https://graph.microsoft.com/.default');
    form.append('grant_type', 'client_credentials');

    const tokenResponse = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        form,
        { headers: form.getHeaders() }
    );

    return tokenResponse.data.access_token;
}

async function getAllPages(client, request) {
    let allValues = [];
    let response = await client.api(request).get();
    log.debug(request)
    while (response) {
        allValues = allValues.concat(response.value);
        if (!response['@odata.nextLink']) break;
        response = await client.api(response['@odata.nextLink']).get();
    }

    return allValues;
}

async function getUsersAndGroups(clientId, clientSecret, tenantId) {
    const accessToken = await getAccessToken(clientId, clientSecret, tenantId);
    const client = graph.Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        },
    });

    const users = await getAllPages(client, '/users?$filter=accountEnabled eq true');
    const limit = pLimit(2); // limit to 2 parallel requests
    var completedUsers = 0
    var totalUsers = users.length
    // Map function to request each user's memberOf property which includes groups
    const userGroupPromises = users.map(user => limit(async () => {
        log.debug(`${completedUsers} / ${totalUsers} Updating user ID ${user.id}`)
        const groups = await getAllPages(client, `/users/${user.id}/transitiveMemberOf`);
        var flatGroups = []
        for (var group of groups) {
            flatGroups.push(group.id)
            flatGroups.push(group.displayName)
        }
        user.groups = flatGroups

        log.debug(`${completedUsers} / ${totalUsers} Finished updating user ${user.id}`)
        completedUsers++
        return user
    }));

    const usersAndGroups = await Promise.all(userGroupPromises);
    log.debug("Finished retrieving all users from msgraph")
    let obj = usersAndGroups.reduce((accumulator, current) => {
        let id = current.id;
        // Create a new property in the accumulator object using the id as the key
        // and the remaining user data as the value
        accumulator[id] = current;

        return accumulator;
    }, {});
    return obj;
}

async function runUpdate() {
    log.debug("Starting update of users and groups from Microsoft Graph")
    const currentConfig = getConfig()
    var userGroups = await getUsersAndGroups(currentConfig.idp_client_id, currentConfig.idp_client_secret, currentConfig.idp_tenant_id)
    fs.writeFileSync("output.json", JSON.stringify(userGroups))
    await redisClient.set('veriflow:users', JSON.stringify(update));
    log.debug("Finished update of users and groups from Microsoft Graph")
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


export default { 
    runUpdate,
    getUserById
};