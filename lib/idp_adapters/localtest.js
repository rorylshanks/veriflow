import fs from 'fs';


async function runUpdate() {
    var result = JSON.parse(fs.readFileSync("output.json"))
    console.log(result)
    return result
}

export default { runUpdate };