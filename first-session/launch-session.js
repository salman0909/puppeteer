const puppeteer = require('puppeteer');
// Toggle this to false for local visual debugging, true for production runs
const HEADLESS_MODE = true;

// Detect if running in a container/CI environment as root — common cause of
// sandbox launch failures. Adjust this check based on your actual CI setup.
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

(async () => {
  let browser;

  try {
    console.log('[INFO] Launching browser session...');

    browser = await puppeteer.launch({
      headless: false,        // visible window for this demo
      defaultViewport: null,  // use full window size instead of fixed viewport
      args: ['--start-maximized']
    });

    console.log('[INFO] Browser launched. Version:', await browser.version());

    const page = await browser.newPage();
    console.log('[INFO] New page/tab created.');

    // Navigate and wait until network is idle (page fully loaded)
    await page.goto('https://example.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    const title = await page.title();
    console.log('[INFO] Page loaded. Title captured:', title);

    // Proof-of-execution screenshot
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
