import log from '../util/logging.js';

async function getFormAuthCookie(req, res, route) {
  if (!route.form_auth) {
    log.info(`Form auth not enabled for this route: ${JSON.stringify(route)}`);
    return;
  }

  try {
    const fetchOptions = getFetchOptions(route.form_auth, route.post_type);

    const response = await fetch(route.form_auth.url, fetchOptions);

    if (!response.ok) {
      log.error(`Form auth request failed with status: ${response.status}`);
      return;
    }

    log.info(`Form auth request successful. Status: ${response.status}`);

    const cookies = response.headers.getSetCookie();
    log.info(`Received ${cookies.length} cookie(s). Setting cookies on response.`);
    if (cookies && cookies.length > 0) {
      res.set('Set-Cookie', cookies);
      
    } else {
      log.warn('No cookies received in the form auth response.');
    }

    updateSessionCookieExpiration(req, route.form_auth.ttl)

  } catch (error) {
    log.error(`Error during form auth request: ${error.message}`);
  }
}

function updateSessionCookieExpiration(req, routeTTL) {
  // Ensure the request has a session and cookie object
  if (!req?.session?.cookie) return;

  // If routeTTL is null, undefined, or not a number, do nothing
  if (typeof routeTTL !== 'number') return;

  const nowPlusTTL = new Date(Date.now() + routeTTL);

  const currentExpires = new Date(req.session.cookie.expires);

  if (nowPlusTTL < currentExpires) {
    log.info(`Session expiration updated due to form_auth TTL restriction`);
    req.session.cookie.expires = nowPlusTTL
  }

}

  // Helper function to generate fetch options based on the post type
  function getFetchOptions(formAuth, postType) {
    let headers, body;
    if (postType === 'formdata') {
      headers = { 'content-type': 'application/x-www-form-urlencoded' };
      // Convert the body to form data using URLSearchParams
      body = new URLSearchParams(formAuth.body);
    } else {
      headers = { 'content-type': 'application/json' };
      body = JSON.stringify(formAuth.body);
    }
    
    return {
      method: formAuth.method,
      headers,
      body
    };
  }

export default {
  getFormAuthCookie,
};
