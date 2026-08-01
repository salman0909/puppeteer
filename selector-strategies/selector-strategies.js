const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
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
      console.log('[INFO] Root/container detected — adding --no-sandbox.');
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: { width: 1280, height: 800 },
      args: launchArgs
    });

    page = await browser.newPage();
    console.log('[INFO] Navigating to test page...');
    await page.goto('https://the-internet.herokuapp.com/add_remove_elements/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('[INFO] Adding 3 elements to create real selector ambiguity...');
    for (let i = 0; i < 3; i++) {
      await page.click('button[onclick="addElement()"]');
    }

    // Confirm 3 buttons now exist on the page
    await page.waitForFunction(
      () => document.querySelectorAll('.added-manually').length === 3,
      { timeout: 5000 }
    );

    // === TEST 1: CSS class selector — proves ambiguity exists ===
    console.log('\n[TEST 1] Query using class selector .added-manually');
    const allByClass = await page.$$('.added-manually');
    console.log(`[RESULT] Found ${allByClass.length} elements sharing the same class`);

    // === TEST 2: Single-element query — demonstrates the silent risk ===
    console.log('\n[TEST 2] Single-element query using page.$');
    const firstOnly = await page.$('.added-manually');
    const firstIndex = await firstOnly.evaluate(el => {
      const all = Array.from(document.querySelectorAll('.added-manually'));
      return all.indexOf(el);
    });
    console.log(`[RESULT] page.$ silently returned element at DOM position: ${firstIndex}`);
    console.log('[INFO] No error was thrown — this is the exact risk described in the Scenario.');

    // === TEST 3: Text-based selector — precise, content-driven targeting ===
    console.log('\n[TEST 3] Text-based match using XPath-style selector');
    const textMatches = await page.$$('::-p-xpath(//button[text()="Delete"])');
    console.log(`[RESULT] Text-based selector matched ${textMatches.length} button(s) with exact text "Delete"`);

    // === TEST 4: Safe deletion pattern — always re-query after DOM changes ===
    console.log('\n[TEST 4] Safe deletion: re-query after each action');
    let before = await page.$$('.added-manually');
    console.log(`[INFO] Before deletion: ${before.length} buttons present`);

    await before[0].click();

    // Wait for the DOM to actually reflect the change before re-querying
    await page.waitForFunction(
      (expectedCount) => document.querySelectorAll('.added-manually').length === expectedCount,
      { timeout: 5000 },
      before.length - 1
    );

    const after = await page.$$('.added-manually');
    console.log(`[RESULT] After deletion: ${after.length} buttons remain`);

    await page.screenshot({ path: 'proof-selector-strategies.png' });
    console.log('[INFO] Screenshot saved: proof-selector-strategies.png');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'proof-selector-FAILURE-state.png' }).catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
