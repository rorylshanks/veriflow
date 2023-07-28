import fs from 'fs';


async function runUpdate() {
    var result = JSON.parse(fs.readFileSync("output.json"))
    return result
}

export default {runUpdate};