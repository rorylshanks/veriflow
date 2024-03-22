import fs from 'fs/promises';
import { getConfig } from '../../util/config.js';
import log from '../../util/logging.js'

async function getLocalIdpConfig() {
    const currentConfig = getConfig()
    let localFile = currentConfig.idp_provider_localfile_location
    let fileContents = await fs.readFile(localFile)
    var result = JSON.parse(fileContents)
    return result
}

async function runUpdate() {
    var result = await getLocalIdpConfig()
    log.debug(result)
    return result
}

async function getUserById(id) {
    var config = await getLocalIdpConfig()
    if (!config) {
        return null
    }
    return config[id]
}

async function getAllUsers() {
    var config = await getLocalIdpConfig()
    return config
}

export default { 
    runUpdate,
    getUserById,
    getAllUsers
};