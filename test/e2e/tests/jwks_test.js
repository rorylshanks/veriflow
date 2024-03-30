Feature('JWKS').retry(3);

Scenario('I can see JWKS from configuration', async ({ I }) => {
    I.amOnPage('http://veriflow.localtest.me/.veriflow/jwks.json');
    I.see("kid")
})