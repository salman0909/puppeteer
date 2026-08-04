const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

const TARGET_PAGES = [
  { label: 'Login page', url: 'https://the-internet.herokuapp.com/login' },
  { label: 'Tables page', url: 'https://the-internet.herokuapp.com/tables' },
  { label: 'Dropdown page', url: 'https://the-internet.herokuapp.com/dropdown' },
  { label: 'Dynamic loading page', url: 'https://the-internet.herokuapp.com/dynamic_loading/2' },
  { label: 'Iframe page', url: 'https://the-internet.herokuapp.com/iframe' }
];

// One independent check: open a page, navigate, record its own timing
async function checkPage(browser, target) {
  const page = await browser.newPage();
  const start = Date.now();
  try {
    await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 30000 });
    const title = await page.title();
    const duration = Date.now() - start;
    console.log(`[CHECK] ${target.label} — loaded "${title}" in ${duration}ms`);
    return { label: target.label, duration, success: true };
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[CHECK] ${target.label} — FAILED after ${duration}ms: ${error.message}`);
    return { label: target.label, duration, success: false };
  } finally {
    await page.close();
  }
}

// Runs an array of check functions with at most `limit` running concurrently at once
async function runWithConcurrencyLimit(items, limit, workerFn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      const result = await workerFn(current);
      results.push(result);
    }
  }

  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
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

    // === BASELINE: Sequential execution ===
    console.log('\n=== SEQUENTIAL EXECUTION ===');
    const sequentialStart = Date.now();
    for (const target of TARGET_PAGES) {
      await checkPage(browser, target);
    }
    const sequentialTotal = Date.now() - sequentialStart;
    console.log(`[RESULT] Sequential total time: ${sequentialTotal}ms`);

    // === COMPARISON: Fully concurrent execution ===
    console.log('\n=== FULLY CONCURRENT EXECUTION ===');
    const concurrentStart = Date.now();
    await Promise.all(TARGET_PAGES.map(target => checkPage(browser, target)));
    const concurrentTotal = Date.now() - concurrentStart;
    console.log(`[RESULT] Fully concurrent total time: ${concurrentTotal}ms`);

    // === RECOMMENDED PATTERN: Concurrency-limited execution ===
    console.log('\n=== CONCURRENCY-LIMITED EXECUTION (max 3 at a time) ===');
    const limitedStart = Date.now();
    await runWithConcurrencyLimit(TARGET_PAGES, 3, target => checkPage(browser, target));
    const limitedTotal = Date.now() - limitedStart;
    console.log(`[RESULT] Concurrency-limited (3) total time: ${limitedTotal}ms`);

    // === SUMMARY COMPARISON ===
    console.log('\n=== SUMMARY ===');
    console.log(`Sequential:            ${sequentialTotal}ms`);
    console.log(`Fully concurrent:      ${concurrentTotal}ms`);
    console.log(`Concurrency-limited(3):${limitedTotal}ms`);

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
