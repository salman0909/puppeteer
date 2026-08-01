const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

// Reusable retry-with-backoff helper
async function retryWithBackoff(fn, maxAttempts = 5, baseDelayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt} of ${maxAttempts}...`);
      const result = await fn();
      console.log(`[RETRY] Attempt ${attempt} succeeded.`);
      return result;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`All ${maxAttempts} attempts failed. Last error: ${error.message}`);
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`[RETRY] Attempt ${attempt} failed (${error.message}). Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

(async () => {
  let browser, page;

  try {
    console.log('[INFO] Launching browser...');
    const launchArgs = [];
    if (RUNNING_AS_ROOT_CONTAINER) {
      console.log('[INFO] Root/container detected — adding --no-sandbox.');
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: { width: 1280, height: 800 },
      args: launchArgs
    });

    page = await browser.newPage();
    await page.goto('https://the-internet.herokuapp.com/dynamic_loading/2', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // === DEMO 1: The trap — waitForSelector WITHOUT visible:true ===
    console.log('\n[DEMO 1] Naive check: waitForSelector without visible:true');
    await page.click('button');
    const startNaive = Date.now();
    await page.waitForSelector('#finish', { timeout: 5000 });
    console.log(`[RESULT] Naive waitForSelector resolved in ${Date.now() - startNaive}ms`);

    const isVisibleAtNaiveResolve = await page.evaluate(() => {
      const el = document.querySelector('#finish');
      const style = window.getComputedStyle(el);
      return style.display !== 'none';
    });
    console.log('[RESULT] Was #finish actually visible at that moment?', isVisibleAtNaiveResolve);

    // Reload to reset the page state for a clean second demonstration
    await page.reload({ waitUntil: 'networkidle2' });

    // === DEMO 2: Correct approach — visible:true wrapped in retry logic ===
    console.log('\n[DEMO 2] Correct check: waitForSelector WITH visible:true, wrapped in retry');
    await page.click('button');

    const finishText = await retryWithBackoff(async () => {
      await page.waitForSelector('#finish', { visible: true, timeout: 3000 });
      const text = await page.$eval('#finish', el => el.textContent.trim());
      if (!text) throw new Error('Element visible but text still empty');
      return text;
    }, 5, 500);

    console.log('[RESULT] Correctly retrieved text after visibility confirmed:', finishText);

    await page.screenshot({ path: 'proof-dynamic-content-loaded.png' });
    console.log('[INFO] Screenshot saved: proof-dynamic-content-loaded.png');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'proof-wait-retry-FAILURE-state.png' }).catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
