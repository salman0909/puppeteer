const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

const TARGET_URL = 'https://the-internet.herokuapp.com/broken_images';
const BLOCKED_RESOURCE_TYPES = ['image', 'font', 'stylesheet'];

async function measureLoad(browser, { blockResources }) {
  const page = await browser.newPage();
  let totalRequests = 0;
  let blockedRequests = 0;
  let allowedRequests = 0;

  if (blockResources) {
    await page.setRequestInterception(true);

    page.on('request', request => {
      totalRequests += 1;
      const type = request.resourceType();

      if (BLOCKED_RESOURCE_TYPES.includes(type)) {
        blockedRequests += 1;
        request.abort();
      } else {
        allowedRequests += 1;
        request.continue();
      }
    });
  } else {
    page.on('request', () => {
      totalRequests += 1;
      allowedRequests += 1;
    });
  }

  const start = Date.now();
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
  const duration = Date.now() - start;

  // Confirm the actual content we care about is still present, regardless of blocking
  const headingText = await page.$eval('h3', el => el.textContent.trim()).catch(() => null);

  await page.close();

  return { duration, totalRequests, blockedRequests, allowedRequests, headingText };
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

    console.log('\n=== BASELINE: No request blocking ===');
    const baseline = await measureLoad(browser, { blockResources: false });
    console.log(`[RESULT] Load time: ${baseline.duration}ms`);
    console.log(`[RESULT] Total requests observed: ${baseline.totalRequests}`);
    console.log(`[RESULT] Heading text captured: "${baseline.headingText}"`);

    console.log('\n=== WITH BLOCKING: images, fonts, stylesheets aborted ===');
    const blocked = await measureLoad(browser, { blockResources: true });
    console.log(`[RESULT] Load time: ${blocked.duration}ms`);
    console.log(`[RESULT] Total requests observed: ${blocked.totalRequests}`);
    console.log(`[RESULT] Requests blocked: ${blocked.blockedRequests}`);
    console.log(`[RESULT] Requests allowed through: ${blocked.allowedRequests}`);
    console.log(`[RESULT] Heading text captured: "${blocked.headingText}"`);

    console.log('\n=== SUMMARY ===');
    console.log(`Baseline load time:  ${baseline.duration}ms`);
    console.log(`Blocked load time:   ${blocked.duration}ms`);
    console.log(`Content integrity:   ${baseline.headingText === blocked.headingText ? 'PRESERVED — same heading text captured in both runs' : 'MISMATCH — investigate before relying on this filter list'}`);

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
