const yaml = require('js-yaml');
const fs   = require('fs/promises');

async function reloadConfig() {
    const doc = yaml.load(await fs.readFile('config.yaml', 'utf8'));
    console.log(doc)
}


module.exports = {
    reloadConfig
}