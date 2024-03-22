Feature('Admin Page').retry(3);

Scenario('I can login to admin page', async ({ I }) => {
    I.amOnPage('http://veriflow.localtest.me/.veriflow/admin/sessions');
    I.login();
    I.see("Sessions")
});

Scenario('I cant login to admin page as non admin', async ({ I }) => {
    I.amOnPage('http://veriflow.localtest.me/.veriflow/admin/sessions');
    I.fillField('login', 'denied@veriflow.dev');
    I.fillField('password', 'password');
    I.click('Login');
    I.see("Unauthorized")
});


