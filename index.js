const fs = require('fs');
const puppeteer = require('puppeteer');
const unzipper = require('unzipper');
const auth = require('./auth');

const DATA_URL = 'https://letterboxd.com/settings/data/';
const DOWNLOAD_URL = 'https://letterboxd.com/data/export';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(DATA_URL);

    let pageTitle = await page.title();

    if (pageTitle.includes('Sign In')) {
      console.log('Sign in required');
    }

    const signInForm = await page.$('#signin-form');
    const usernameBox = await signInForm.$('#signin-username');
    const passwordBox = await signInForm.$('#signin-password');
    const submitButton = await signInForm.$('input[type=submit]');

    await usernameBox.type(auth.username);
    await passwordBox.type(auth.password);

    const [response] = await Promise.all([
      page.waitForNavigation(),
      passwordBox.press('Enter'),
    ]);

    pageTitle = await page.title();
    if (pageTitle.includes('Update your settings')) {
      console.log('Successfully logged in');
    }

    const dlResponse = await page.evaluate(() => {
      return fetch('https://letterboxd.com/data/export', {
        method: 'GET',
        credentials: 'include',
      }).then(r => r.text());
    });

    //fs.writeFileSync('./output/archive.zip', dlResponse);
    //fs.createReadStream('./output/archive.zip').pipe(
    //  unzipper.Extract({path: './output/'}),
    //);
    console.log('Done');

    await browser.close();
  } catch (error) {
    console.error(error);
  }
})();
