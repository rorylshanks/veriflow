Feature('Login').retry(3);

Scenario('Basic login test', async ({ I }) => {
    I.amOnPage('http://test-basic-login.localtest.me/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('HTTPS Upstream Test', async ({ I }) => {
    I.amOnPage('http://test-https-upstream.localtest.me/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Removing headers', async ({ I }) => {
    I.amOnPage('http://test-removing-headers.localtest.me/get');
    I.login();
    I.dontSee("x-veriflow-user-id")
});

Scenario('Adding headers', async ({ I }) => {
    I.amOnPage('http://test-adding-headers.localtest.me/get');
    I.login();
    I.see("x-pomerium-claim-email")
    I.see("x-test-header")
});

Scenario('Testing mTLS', async ({ I }) => {
    I.amOnPage('http://test-mtls-auth.localtest.me/');
    I.login();
    I.see("Veriflow-Test-Cert")
    I.see("Veriflow-Test-CA")
});

Scenario('Testing Header Mapping', async ({ I }) => {
    I.amOnPage('http://test-header-mapping.localtest.me/');
    I.login();
    I.see("ThisIsATestHeaderFromTheHeaderMapping")
    I.see("TestHeaderFromGroup")
    I.dontSee("TestAbsentHeaderFromGroup")
});

Scenario('Testing Header Mapping Inline', async ({ I }) => {
    I.amOnPage('http://test-header-mapping-inline.localtest.me/');
    I.login();
    I.see("ThisIsATestHeaderFromTheHeaderMapping")
    I.see("TestHeaderFromGroup")
    I.dontSee("TestAbsentHeaderFromGroup")
});

Scenario('Testing Token Auth', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer ThisIsATestToken',
    });
    I.amOnPage('http://test-token-auth.localtest.me/');
    I.see("x-veriflow-user-id")
});

Scenario('Testing Unauthorized Flow', async ({ I }) => {
    I.amOnPage('http://test-unauthorized-login.localtest.me/');
    I.login()
    I.see("ERR_NOT_AUTHORIZED")
});

Scenario('Advanced matchers test', async ({ I }) => {
    I.amOnPage('http://test-advanced-matchers.localtest.me/get');
    I.login();
    I.see("x-veriflow-user-id")
    I.amOnPage('http://test-advanced-matchers.localtest.me/should404');
    I.see("ERR_ROUTE_NOT_FOUND")
});

Scenario('Dynamic Upstreams Test', async ({ I }) => {
    I.amOnPage('http://test-dynamic-upstreams.localtest.me/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Dynamic Upstreams Test SRV', async ({ I }) => {
    I.amOnPage('http://test-dynamic-upstreams-srv.localtest.me/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Unauthenticated Access test', async ({ I }) => {
    I.amOnPage('http://test-unauthenticated-access.localtest.me/get');
    I.see("x-public-access")
});