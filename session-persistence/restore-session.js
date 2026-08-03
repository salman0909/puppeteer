const puppeteer = require('puppeteer');
const fs = require('fs');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

(async () => {
  let browser, page;

  try {
    if (!fs.existsSync('session-cookies.json')) {
      throw new Error('session-cookies.json not found — run save-session.js first.');
    }

    const cookies = JSON.parse(fs.readFileSync('session-cookies.json', 'utf-8'));
    console.log(`[INFO] Loaded ${cookies.length} cookie(s) from session-cookies.json`);

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

    // Cookies must be set BEFORE navigation, on a page matching the cookie domain
    console.log('[INFO] Applying saved cookies before navigation...');
    await page.setCookie(...cookies);

    console.log('[INFO] Navigating directly to the secure area, without logging in...');
    await page.goto('https://the-internet.herokuapp.com/secure', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Verify the restored session is genuinely authenticated
    const pageContent = await page.content();
    const isAuthenticated = pageContent.includes('You logged into a secure area');

    if (isAuthenticated) {
      console.log('[RESULT] Session restored successfully — reached secure area without logging in.');
    } else {
      console.log('[RESULT] Session restore FAILED — likely redirected to login. Cookies may have expired.');
    }

    await page.screenshot({ path: 'proof-session-restored.png' });
    console.log('[INFO] Screenshot saved: proof-session-restored.png');

  } catch (error) {
    console.error('[ERROR] Restore session failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
