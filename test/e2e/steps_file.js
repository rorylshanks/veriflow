// steps_file.js
module.exports = function() {
    return actor({
  
      login: function() {
        this.fillField('login', 'test@veriflow.dev');
        this.fillField('password', 'password');
        this.click('Login');
        this.waitForNavigation();
      }
    });
  }