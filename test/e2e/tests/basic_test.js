Feature('Login').retry(3);

Scenario('Basic login test', async ({ I }) => {
    I.amOnPage('http://test-basic-login.localtest.me:2080/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('HTTPS Upstream Test', async ({ I }) => {
    I.amOnPage('http://test-https-upstream.localtest.me:2080/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Removing headers', async ({ I }) => {
    I.amOnPage('http://test-removing-headers.localtest.me:2080/get');
    I.login();
    I.dontSee("x-veriflow-user-id")
});

Scenario('Adding headers', async ({ I }) => {
    I.amOnPage('http://test-adding-headers.localtest.me:2080/get');
    I.login();
    I.see("x-pomerium-claim-email")
    I.see("x-test-header")
});

Scenario('Testing mTLS', async ({ I }) => {
    I.amOnPage('http://test-mtls-auth.localtest.me:2080/');
    I.login();
    I.see("Veriflow-Test-Cert")
    I.see("Veriflow-Test-CA")
});

Scenario('Testing Header Mapping', async ({ I }) => {
    I.amOnPage('http://test-header-mapping.localtest.me:2080/');
    I.login();
    I.see("ThisIsATestHeaderFromTheHeaderMapping")
    I.see("TestHeaderFromGroup")
    I.dontSee("TestAbsentHeaderFromGroup")
});

Scenario('Testing Token Auth', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer ThisIsATestToken',
    });
    I.amOnPage('http://test-token-auth.localtest.me:2080/');
    I.see("x-veriflow-user-id")
});

Scenario('Testing Unauthorized Flow', async ({ I }) => {
    I.amOnPage('http://test-unauthorized-login.localtest.me:2080/');
    I.login()
    I.see("ERR_NOT_AUTHORIZED")
});

Scenario('Advanced matchers test', async ({ I }) => {
    I.amOnPage('http://test-advanced-matchers.localtest.me:2080/get');
    I.login();
    I.see("x-veriflow-user-id")
    I.amOnPage('http://test-advanced-matchers.localtest.me:2080/should404');
    I.see("ERR_ROUTE_NOT_FOUND")
});

Scenario('Dynamic Upstreams Test', async ({ I }) => {
    I.amOnPage('http://test-dynamic-upstreams.localtest.me:2080/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Dynamic Upstreams Test SRV', async ({ I }) => {
    I.amOnPage('http://test-dynamic-upstreams-srv.localtest.me:2080/get');
    I.login();
    I.see("x-veriflow-user-id")
});

Scenario('Unauthenticated Access test', async ({ I }) => {
    I.amOnPage('http://test-unauthenticated-access.localtest.me:2080/get');
    I.see("x-public-access")
});