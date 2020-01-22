#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');
const puppeteer = require('puppeteer');
const unzipper = require('unzipper');
const csvToJson = require('csvtojson');
const auth = require('./auth');

const SETTINGS_URL = 'https://letterboxd.com/settings/data';
const DOWNLOAD_URL = 'https://letterboxd.com/data/export';
const ARCHIVE_PATH = './tmp/archive.zip';
const UNZIP_PATH = './tmp';

const WATCHED_CSV_PATH = './tmp/watched.csv';
const TOWATCH_CSV_PATH = './tmp/watchlist.csv';
const WATCHED_JSON_PATH = './output/watched.json';
const TOWATCH_JSON_PATH = './output/towatch.json';

function createDir(dir) {
  if (!fs.existsSync(dir)) {
    return fs.mkdirSync(dir);
  }
}

function deleteDir(dir) {
  if (fs.existsSync(dir)) {
    return rimraf.sync(dir);
  }
}

async function downloadBlob(page) {
  const data = await page.evaluate(async () => {
    const resp = await window.fetch('https://letterboxd.com/data/export');

    if (!resp.ok) {
      throw new Error(resp.statusText);
    }

    const data = await resp.blob();
    const reader = new FileReader();
    return new Promise(resolve => {
      reader.addEventListener('loadend', () =>
        resolve({
          url: reader.result,
          mime: resp.headers.get('Content-Type'),
        }),
      );
      reader.readAsDataURL(data);
    });
  });

  return {
    buffer: Buffer.from(data.url.split(',')[1], 'base64'),
    mime: data.mime,
  };
}

async function scrapeLetterboxd() {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(SETTINGS_URL);

    let pageTitle = await page.title();

    if (pageTitle.includes('Sign In')) {
      console.log(`Signing in as ${auth.username}`);
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

    console.log('Unzipping archive');
    await unzip(ARCHIVE_PATH, UNZIP_PATH);

    console.log('Scrape successful');

    await browser.close();
  } catch (error) {
    console.error('Scraping error');
    console.error(error);
    throw error;
  }
}

async function unzip(archive, tmpDir) {
  return new Promise(resolve => {
    const stream = fs
      .createReadStream(archive)
      .pipe(unzipper.Extract({path: tmpDir}));
    stream.on('finish', resolve);
  });
}

function transformFilms(filmArray) {
  return filmArray.map(film => ({
    date_updated: film.Date,
    name: film.Name,
    year: film.Year,
    link: film['Letterboxd URI'],
  }));
}

(async () => {
  try {
    console.log('Setting up dirs');
    createDir('./tmp');
    createDir('./output');

    await scrapeLetterboxd();
    console.log('Converting CSV to JSON');
    const watchedJson = transformFilms(
      await csvToJson().fromFile(WATCHED_CSV_PATH),
    );
    const towatchJson = transformFilms(
      await csvToJson().fromFile(TOWATCH_CSV_PATH),
    );

    console.log('Writing JSON');
    fs.writeFileSync(WATCHED_JSON_PATH, JSON.stringify(watchedJson));
    fs.writeFileSync(TOWATCH_JSON_PATH, JSON.stringify(towatchJson));

    console.log('Cleaning up');
    deleteDir('./tmp');

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
