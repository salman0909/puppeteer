const puppeteer = require('puppeteer');
const fs = require('fs');

const HEADLESS_MODE = true;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

(async () => {
  let browser, page;

  try {
    console.log('[INFO] Launching browser...');
    const launchArgs = [];
    if (RUNNING_AS_ROOT_CONTAINER) {
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: { width: 1280, height: 800 },
      args: launchArgs
    });

    page = await browser.newPage();
    await page.goto('https://the-internet.herokuapp.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('[INFO] Logging in...');
    await page.type('#username', 'tomsmith', { delay: 50 });
    await page.type('#password', 'SuperSecretPassword!', { delay: 50 });
    await page.click('button[type="submit"]');

    await page.waitForSelector('#flash', { timeout: 10000 });
    const flashMessage = await page.$eval('#flash', el => el.textContent.trim());
    console.log('[RESULT] Login response:', flashMessage);

    if (!flashMessage.includes('logged into')) {
      throw new Error('Login did not succeed — cannot save an unauthenticated session.');
    }

    const cookies = await page.cookies();
    fs.writeFileSync('session-cookies.json', JSON.stringify(cookies, null, 2));
    console.log(`[INFO] Saved ${cookies.length} cookie(s) to session-cookies.json`);

  } catch (error) {
    console.error('[ERROR] Save session failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
