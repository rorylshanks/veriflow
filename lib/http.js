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
import metrics from '../util/metrics.js'
import { randomUUID } from 'node:crypto'
import admin from './adminpage.js'

const config = getConfig()

var trusted_ranges = ["loopback"].concat(config.trusted_ranges || [])
log.debug({ message: `Setting trusted proxies to ${trusted_ranges}` })
app.set('trust proxy', trusted_ranges)

var defaultCookieOptions = { maxAge: 3600000 }

// Initialize sesssion storage.
app.use(
  session({
    name: "vfsession",
    store: redisHelper.getRedisStore(),
    resave: false,
    saveUninitialized: false,
    secret: config.cookie_secret,
    cookie: { 
      ...defaultCookieOptions,
      ...config.cookie_settings
    }
  })
)

var jwks

const getPublicKeyFromPrivateKey = (privateKeyPem) => {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  return crypto.createPublicKey(privateKey).export({ type: 'pkcs1', format: 'pem' });
};

function generateJwks() {
  let signing_key = config.signing_key
  let buff = Buffer.from(signing_key, 'base64');
  let pemPrivateKey = buff.toString('ascii');
  const pemPublicKey = getPublicKeyFromPrivateKey(pemPrivateKey);
  jwks = pem2jwk(pemPublicKey);
  jwks.kid = config.kid_override || "0"
  jwks.alg = config.signing_key_algorithm || "RS256"
  jwks.use = "sig"
}


generateJwks()

app.use(express.json());
app.use(express.urlencoded({ extended: true }))

// Request ID setting middleware
app.use((req, res, next) => {
  var requestId = req.get("x-veriflow-request-id")
  if (!requestId) {
    requestId = randomUUID()
  }
  req.headers["x-veriflow-request-id"] = requestId
  next()
})

var redirectBasePath = getRedirectBasepath()

app.get('/ping', (req, res) => {
  res.sendStatus(200)
})

if (config?.admin?.enable == true) {
  app.use(redirectBasePath + '/admin', admin.verifyAdminJwt)
  app.get(redirectBasePath + '/admin/sessions', admin.renderSessionsPage)
  app.get(redirectBasePath + '/admin/sessions/kill', admin.killSession)
  app.get(redirectBasePath + '/admin/users', admin.renderUsersPage)
  app.get(redirectBasePath + '/admin/users/details', admin.renderUserDetailsPage)
}

app.get(redirectBasePath + '/external_verify', ssoController.externalAuthVerify)

app.get(redirectBasePath + '/verify', ssoController.verifyAuth)
app.get(redirectBasePath + '/set', ssoController.setSessionCookie)

app.get(redirectBasePath + '/logout', async (req, res) => {
  if (req.session.loggedin) {
    await redisHelper.logUserOutAllSessions(req.session.userId)
  }
  req.session.destroy()
  var html = await errorpages.renderErrorPage(200, "LOGOUT_SUCCESS", req)
  res.send(html)
})

app.get(redirectBasePath + '/auth', ssoController.redirectToSsoProvider)
app.get(redirectBasePath + '/callback', ssoController.verifySsoCallback)

var jwksPath = config.jwks_path || getRedirectBasepath() + "/jwks.json"

app.get(jwksPath, (req, res) => {
  res.json({
    keys: [jwks],
  });
});

app.listen(getAuthListenPort(), 'localhost', () => log.debug("Veriflow HTTP server running"));

metrics.startMetricsServer()