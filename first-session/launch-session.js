const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;

const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

(async () => {
  let browser;

  try {
    console.log('[INFO] Launching browser session...');

    const launchArgs = ['--start-maximized'];
    if (RUNNING_AS_ROOT_CONTAINER) {
      console.log('[INFO] Root/container environment detected — adding --no-sandbox flag.');
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: null,
      args: launchArgs
    });

    console.log('[INFO] Browser launched. Version:', await browser.version());

    const page = await browser.newPage();
    console.log('[INFO] New page/tab created.');

    await page.goto('https://example.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const title = await page.title();
    console.log('[INFO] Page loaded. Title captured:', title);

    await page.screenshot({ path: 'proof-session-loaded.png' });
    console.log('[INFO] Screenshot saved as proof-session-loaded.png');

  } catch (error) {
    console.error('[ERROR] Session failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
