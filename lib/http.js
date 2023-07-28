import express from 'express';
const app = express();
import session from 'express-session';
import cookieParser from 'cookie-parser';
import ssoController from './sso.js';

import RedisStore from "connect-redis"
import {createClient} from "redis"
import log from '../util/logging.js'
import pinoHttp from 'pino-http';

const httpLogger = pinoHttp({
  logger: log,
  autoLogging: {
    ignorePaths: ['/healthcheck'], // Paths to ignore while logging.
  }
});

// Initialize client.
let redisClient = createClient({
  url: 'redis://' + process.env.REDIS_HOST
})
redisClient.connect().catch(console.error)

// Initialize store.
let redisStore = new RedisStore({
  client: redisClient,
  prefix: "vfsession:",
})

// Initialize sesssion storage.
app.use(
  session({
    store: redisStore,
    resave: false, // required: force lightweight session keep alive (touch)
    saveUninitialized: false, // recommended: only save session when data exists
    secret: "keyboard cat",
  })
)

app.use((req, res, next) => {
  httpLogger(req, res);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }))

app.use(cookieParser());

app.get('/.veriflow/verify', ssoController.verifyAuth)

app.get('/.veriflow/auth', ssoController.redirectToSsoProvider)
app.get('/.veriflow/callback', ssoController.verifySsoCallback)


app.listen(3000, () => log.debug("Veriflow HTTP server running on port 3000"));
