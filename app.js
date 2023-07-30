
import { reloadConfig } from './util/config.js';
import authz from './lib/authz.js';
import log from './util/logging.js'

async function main() {
    log.info("Starting Verflow Server")
    await reloadConfig()
    await authz.scheduleUpdate()
}

main()

process.on('SIGUSR1', async () => {
    log.info("Reloading config due to SIGUSR1");
    await reloadConfig()
});

import './lib/http.js';
