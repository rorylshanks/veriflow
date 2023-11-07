Feature('Login');

Scenario('Basic login test', async ({ I }) => {
    I.amOnPage('http://test-basic-login.localtest.me:2080/get');
    I.fillField('login', 'test@veriflow.dev');
    I.fillField('password', 'password');
    I.click('Login');
    // Grab the current page content
    I.waitForNavigation();
    I.see("x-veriflow-user-id")
});

Scenario('Removing headers', async ({ I }) => {
    I.amOnPage('http://test-removing-headers.localtest.me:2080/get');
    I.fillField('login', 'test@veriflow.dev');
    I.fillField('password', 'password');
    I.click('Login');
    // Grab the current page content
    I.waitForNavigation();
    I.dontSee("x-veriflow-user-id")
});

Scenario('Adding headers', async ({ I }) => {
    I.amOnPage('http://test-adding-headers.localtest.me:2080/get');
    I.fillField('login', 'test@veriflow.dev');
    I.fillField('password', 'password');
    I.click('Login');
    // Grab the current page content
    I.waitForNavigation();
    I.see("x-pomerium-claim-email")
    I.see("x-test-header")
});

