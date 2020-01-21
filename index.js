const fs = require('fs');
const puppeteer = require('puppeteer');
const unzipper = require('unzipper');
const auth = require('./auth');

const SETTINGS_URL = 'https://letterboxd.com/settings/data';
const DOWNLOAD_URL = 'https://letterboxd.com/data/export';
const ARCHIVE_PATH = './output/archive.zip';
const UNZIP_PATH = './output';

async function downloadBlob(page) {
  const data = await page.evaluate(async () => {
    const resp = await window.fetch('https://letterboxd.com/data/export');

    if (!resp.ok) {
      throw new Error(resp.statusText);
    }

    const data = await resp.blob();
    console.l;
    const reader = new FileReader();
    return new Promise(resolve => {
      reader.addEventListener('loadend', () =>
        resolve({
          url: reader.result,
          mime: resp.headers.get('Content-Type'),
        })
      );
      reader.readAsDataURL(data);
    });
  });

  return {
    buffer: Buffer.from(data.url.split(',')[1], 'base64'),
    mime: data.mime,
  };
}

function unzip(archive, outputDir) {
  return fs.createReadStream(archive).pipe(unzipper.Extract({path: outputDir}));
}

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(SETTINGS_URL);

    let pageTitle = await page.title();

    if (pageTitle.includes('Sign In')) {
      console.log('Signing in...');
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
      console.log('Signed in');
    }

    console.log('Downloading archive');
    const blob = await downloadBlob(page);
    fs.writeFileSync(ARCHIVE_PATH, blob.buffer);

    unzip(ARCHIVE_PATH, UNZIP_PATH);

    console.log('Done');

    await browser.close();
  } catch (error) {
    console.error(error);
  }
})();
