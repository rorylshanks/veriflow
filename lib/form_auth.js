import log from '../util/logging.js';
import { getRouteFromRequest } from '../util/config.js';

async function getFormAuthCookie(req, res) {
  const route = getRouteFromRequest(req);

  if (!route.form_auth) {
    log.trace(`Form auth not enabled for this route: ${JSON.stringify(route)}`);
    return;
  }

  log.infoWithContext(req, `Form auth enabled. Making request to ${route.form_auth.url}`);

  try {
    const fetchOptions = {
      method: route.form_auth.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(route.form_auth.body),
    };

    const response = await fetch(route.form_auth.url, fetchOptions);

    if (!response.ok) {
      log.error(`Form auth request failed with status: ${response.status}`);
      return;
    }

    log.info(`Form auth request successful. Status: ${response.status}`);

    // Extract cookies from the response headers.
    // Depending on the fetch implementation, we might need to use headers.raw() or headers.get()
    let cookies = [];
    const cookie = response.headers.get('set-cookie');
    if (cookie) {
      cookies.push(cookie);
    }

    if (cookies && cookies.length > 0) {
      log.infoWithContext(req, `Received ${cookies.length} cookie(s). Setting cookies on response.`);
      res.setHeader('Set-Cookie', cookies);
    } else {
      log.warn('No cookies received in the form auth response.');
    }
  } catch (error) {
    log.error(`Error during form auth request: ${error.message}`);
  }
}

export default {
  getFormAuthCookie,
};
