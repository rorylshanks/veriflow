import { promisify } from 'util';
var client = require('mysql2').createPool({
    host: process.env.MYSQL_HOST,
    user: "root",
    password: "root",
    database: "devdb"
});

const promiseQuery = promisify(client.query).bind(client)


export default {
    client,
    promiseQuery
};