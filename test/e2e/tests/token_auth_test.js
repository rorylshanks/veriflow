Feature('Token Auth').retry(3);

Scenario('Testing Token Auth', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer ThisIsATestToken',
    });
    I.amOnPage('http://test-token-auth.localtest.me/');
    I.see("x-veriflow-user-id")
});

Scenario('Testing Machine Token Auth Deny', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer MachineToken',
    });
    I.amOnPage('http://test-token-auth.localtest.me/deny');
    I.see("Forbidden")
});

Scenario('Testing Machine Token Auth Allow', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer MachineToken',
    });
    I.amOnPage('http://test-token-auth.localtest.me/allow');
    I.see("x-veriflow-user-id")
});

Scenario('Testing Machine Token Auth Header Mapping', async ({ I }) => {
    I.setPuppeteerRequestHeaders({
        'Authorization': 'Bearer MachineToken',
    });
    I.amOnPage('http://test-token-auth-header-mapping.localtest.me/allow');
    I.see("TestBasicAuthHeaderMapping")
});
