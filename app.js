
import { reloadConfig } from './util/config.js';
import authz from './lib/authz.js';
import log from './util/logging.js'

async function main() {
    log.info("Starting Verflow Server")
    await reloadConfig()
    await authz.scheduleUpdate()
}

main()

import './lib/http.js';
