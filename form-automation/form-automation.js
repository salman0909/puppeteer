const puppeteer = require('puppeteer');

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
      console.log('[INFO] Root/container detected — adding --no-sandbox.');
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: { width: 1280, height: 800 },
      args: launchArgs
    });

    page = await browser.newPage();

    // === PART A: Login form — text fields, submit, server response verification ===
    console.log('\n[PART A] Navigating to login form...');
    await page.goto('https://the-internet.herokuapp.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('[INFO] Filling username field...');
    await page.type('#username', 'tomsmith', { delay: 50 });

    console.log('[INFO] Filling password field...');
    await page.type('#password', 'SuperSecretPassword!', { delay: 50 });

    console.log('[INFO] Submitting form...');
    await page.click('button[type="submit"]');

    // Verify server-side acknowledgment, not just that the click fired
    await page.waitForSelector('#flash', { timeout: 10000 });
    const flashMessage = await page.$eval('#flash', el => el.textContent.trim());
    console.log('[RESULT] Server response message:', flashMessage);

    await page.screenshot({ path: 'proof-login-result.png' });
    console.log('[INFO] Screenshot saved: proof-login-result.png');

    // === PART B: Dropdown — value vs visible label ===
    console.log('\n[PART B] Navigating to dropdown page...');
    await page.goto('https://the-internet.herokuapp.com/dropdown', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Inspect actual option values first — never assume label equals value
    const optionValues = await page.$$eval('#dropdown option', options =>
      options
        .filter(opt => opt.value)
        .map(opt => ({ value: opt.value, label: opt.textContent.trim() }))
    );
    console.log('[INFO] Available dropdown options:', optionValues);

    const targetOption = optionValues.find(opt => opt.label === 'Option 2');
    if (!targetOption) {
      throw new Error('Expected dropdown option "Option 2" not found on page.');
    }

    await page.select('#dropdown', targetOption.value);
    console.log(`[INFO] Selected option with value="${targetOption.value}" (label: "${targetOption.label}")`);

    const selectedValue = await page.$eval('#dropdown', el => el.value);
    console.log('[RESULT] Confirmed selected value:', selectedValue);

    await page.screenshot({ path: 'proof-dropdown-result.png' });
    console.log('[INFO] Screenshot saved: proof-dropdown-result.png');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'proof-form-FAILURE-state.png' }).catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
