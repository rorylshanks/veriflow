
import { reloadConfig } from './util/config.js';
import idp from './lib/idp.js';
import log from './util/logging.js'

async function main() {
    log.info("Starting Verflow Server")
    await reloadConfig()
    await idp.scheduleUpdate()
}

main()

import './lib/http.js';
