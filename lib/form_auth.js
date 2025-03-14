import log from '../util/logging.js';

async function getFormAuthCookie(req, res, route) {
  if (!route.form_auth) {
    log.info(`Form auth not enabled for this route: ${JSON.stringify(route)}`);
    return;
  }

  try {
    const fetchOptions = {
      method: route.form_auth.method,
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(route.form_auth.body)
    };

    const response = await fetch(route.form_auth.url, fetchOptions);
    const responseBody = await response.body()
    if (!response.ok) {
      log.error(`Form auth request failed with status: ${response.status}`);
      console.log(responseBody)
      return;
    }

    log.info(`Form auth request successful. Status: ${response.status}`);

    const cookies = response.headers.getSetCookie();
    log.info(`Received ${cookies.length} cookie(s). Setting cookies on response.`);
    if (cookies && cookies.length > 0) {
      for (var cookie of cookies) {
        res.set('Set-Cookie', cookie);
      }
      
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
