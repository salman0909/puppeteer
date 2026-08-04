const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

// Classify an error into a category based on its actual properties
function classifyError(error) {
  if (error.name === 'TimeoutError') return 'TIMEOUT';
  if (/net::ERR_/.test(error.message)) return 'NAVIGATION_FAILURE';
  return 'SELECTOR_OR_UNKNOWN';
}

async function runCheck(browser, label, checkFn) {
  const page = await browser.newPage();
  console.log(`\n[CHECK] ${label}`);

  try {
    await checkFn(page);
    console.log(`[RESULT] ${label}: PASSED`);
  } catch (error) {
    const category = classifyError(error);
    console.error(`[ERROR] ${label} failed. Category: ${category}. Message: ${error.message}`);

    if (category === 'TIMEOUT') {
      console.log('[RECOVERY] Timeout is often transient — retrying once with an extended timeout...');
      try {
        await checkFn(page, true); // second attempt, extended timeout
        console.log(`[RESULT] ${label}: PASSED on retry`);
      } catch (retryError) {
        console.error(`[RESULT] ${label}: FAILED even after retry. ${retryError.message}`);
      }
    } else if (category === 'NAVIGATION_FAILURE') {
      console.log('[RECOVERY] Navigation failures are not retried — target is likely genuinely unreachable. Alerting immediately.');
    } else {
      console.log('[RECOVERY] Unclassified/selector failure — capturing diagnostic evidence for investigation, not retrying blindly.');
    }

    // Always capture a diagnostic screenshot at the moment of failure
    const safeLabel = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    try {
      await page.screenshot({ path: `failure-${safeLabel}.png` });
      console.log(`[INFO] Diagnostic screenshot saved: failure-${safeLabel}.png`);
    } catch (screenshotError) {
      console.error('[ERROR] Could not capture diagnostic screenshot:', screenshotError.message);
    }
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;

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

    // --- CHECK 1: Deliberately short timeout, likely to genuinely time out ---
    await runCheck(browser, 'Dynamic content visibility check', async (page, isRetry) => {
      await page.goto('https://the-internet.herokuapp.com/dynamic_loading/2', {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      await page.click('button');
      await page.waitForSelector('#finish', {
        visible: true,
        timeout: isRetry ? 8000 : 800 // deliberately too short on first attempt
      });
    });

    // --- CHECK 2: Deliberately non-existent path — genuine navigation failure ---
    await runCheck(browser, 'Decommissioned page check', async (page) => {
      await page.goto('https://the-internet.herokuapp.com/this-path-does-not-exist-xyz', {
        waitUntil: 'networkidle2',
        timeout: 10000
      });
    });

    // --- CHECK 3: Page loads fine, but selector genuinely does not exist ---
    await runCheck(browser, 'Login page structure check', async (page) => {
      await page.goto('https://the-internet.herokuapp.com/login', {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
      await page.waitForSelector('#field-that-does-not-exist', { timeout: 3000 });
    });

  } catch (error) {
    console.error('[FATAL] Unexpected error outside individual checks:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
