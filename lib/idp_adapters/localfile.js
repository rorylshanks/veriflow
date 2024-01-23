import fs from 'fs/promises';
import { getConfig } from '../../util/config.js';
import log from '../util/logging.js'

async function runUpdate() {
    const currentConfig = getConfig()
    let localFile = currentConfig.idp_provider_localfile_location
    let fileContents = await fs.readFile(localFile)
    var result = JSON.parse(fileContents)
    log.debug(result)
    return result
}

export default { runUpdate };