import express from 'express';
const app = express();
import session from 'express-session';
import ssoController from './sso.js';

import RedisStore from "connect-redis"
import { createClient } from "redis"
import log from '../util/logging.js'
import { getConfig } from '../util/config.js';
import { pem2jwk } from 'pem-jwk';
import crypto from 'crypto';


// Initialize client.
let redisClient = createClient({
  url: 'redis://' + getConfig().redis_host + ":" + getConfig().redis_port
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
    name: "vfsession",
    store: redisStore,
    resave: false, // required: force lightweight session keep alive (touch)
    saveUninitialized: false, // recommended: only save session when data exists
    secret: getConfig().cookie_secret,
    cookie: {
      sameSite: "none",
      secure: true
    }
  })
)

var jwks

const getPublicKeyFromPrivateKey = (privateKeyPem) => {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return crypto.createPublicKey(privateKey).export({ type: 'pkcs1', format: 'pem' });
};

function generateJwks() {
  let signing_key = getConfig().signing_key
  let buff = Buffer.from(signing_key, 'base64');
  let pemPrivateKey = buff.toString('ascii');
  const pemPublicKey = getPublicKeyFromPrivateKey(pemPrivateKey);
  jwks = pem2jwk(pemPublicKey);
  jwks.kid = getConfig().kid_override || "0"
  jwks.alg = getConfig().signing_key_algorithm || "RS256"
  jwks.use = "sig"
}


generateJwks()

app.use(express.json());
app.use(express.urlencoded({ extended: true }))

var redirectBasePath = getConfig().redirect_base_path || "/.veriflow"

app.get('/ping', (req, res) => {
  res.sendStatus(200)
})

app.get(redirectBasePath + '/verify', ssoController.verifyAuth)
app.get(redirectBasePath + '/set', ssoController.setSessionCookie)

app.get(redirectBasePath + '/logout', (req, res) => {
  log.info({ message: "Logged user out", user: req.session.userId })
  req.session.destroy()
  res.send("Logged out")
})

app.get(redirectBasePath + '/auth', ssoController.redirectToSsoProvider)
app.get(redirectBasePath + '/callback', ssoController.verifySsoCallback)

app.get(getConfig().jwks_path, (req, res) => {
  res.json({
    keys: [jwks],
  });
});

app.listen(getConfig().auth_listen_port, () => log.debug("Veriflow HTTP server running"));
