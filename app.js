
const configController = require("./lib/config.js")

require("./lib/http.js")

async function main() {
    await configController.reloadConfig()
}

main()