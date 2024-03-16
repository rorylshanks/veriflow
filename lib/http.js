import express from 'express';
const app = express();
import session from 'express-session';
import ssoController from './sso.js';


import redisHelper from "../util/redis.js"
import log from '../util/logging.js'
import { getConfig, getRedirectBasepath, getAuthListenPort } from '../util/config.js';
import { pem2jwk } from 'pem-jwk';
import crypto from 'crypto';
import errorpages from '../util/errorpage.js'



var trusted_ranges = ["loopback"].concat(getConfig().trusted_ranges || [])

if (trusted_ranges) {
  log.info({ message: `Setting trusted proxies to ${trusted_ranges}` })
  app.set('trust proxy', trusted_ranges)
}



// Initialize sesssion storage.
app.use(
  session({
    name: "vfsession",
    store: redisHelper.getRedisStore(),
    resave: false,
    saveUninitialized: false,
    secret: getConfig().cookie_secret,
    cookie: getConfig().cookie_settings || { maxAge: 3600000 }
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

var redirectBasePath = getRedirectBasepath()

app.get('/ping', (req, res) => {
  res.sendStatus(200)
})

app.get(redirectBasePath + '/verify', ssoController.verifyAuth)
app.get(redirectBasePath + '/set', ssoController.setSessionCookie)

app.get(redirectBasePath + '/logout', async (req, res) => {
  if (req.session.loggedin) {
    await redisHelper.logUserOutAllSessions(req.session.userId)
  }
  var html = await errorpages.renderErrorPage(200, "LOGOUT_SUCCESS", req)
  res.send(html)
})

app.get(redirectBasePath + '/auth', ssoController.redirectToSsoProvider)
app.get(redirectBasePath + '/callback', ssoController.verifySsoCallback)

app.get(getConfig().jwks_path, (req, res) => {
  res.json({
    keys: [jwks],
  });
});

app.listen(getAuthListenPort(), 'localhost', () => log.debug("Veriflow HTTP server running"));
