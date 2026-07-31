// lab02-context-isolation.js
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
    console.log('[INFO] Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });

    // --- SESSION A: isolated context ---
    console.log('[INFO] Creating isolated context for Session A...');
    const contextA = await browser.createBrowserContext();
    const pageA = await contextA.newPage();

    await pageA.goto('https://httpbin.org/cookies/set?session=UserA-Session', {
      waitUntil: 'networkidle2'
    });
    console.log('[INFO] Session A cookie set.');

    // --- SESSION B: separate isolated context ---
    console.log('[INFO] Creating isolated context for Session B...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();

    await pageB.goto('https://httpbin.org/cookies/set?session=UserB-Session', {
      waitUntil: 'networkidle2'
    });
    console.log('[INFO] Session B cookie set.');

    // --- VERIFY ISOLATION ---
    // Navigate each page to the cookie-viewer endpoint and capture what each session sees
    await pageA.goto('https://httpbin.org/cookies', { waitUntil: 'networkidle2' });
    await pageB.goto('https://httpbin.org/cookies', { waitUntil: 'networkidle2' });

    const cookiesSeenByA = await pageA.evaluate(() => document.body.innerText);
    const cookiesSeenByB = await pageB.evaluate(() => document.body.innerText);

    console.log('[RESULT] Session A sees:', cookiesSeenByA);
    console.log('[RESULT] Session B sees:', cookiesSeenByB);

    // Screenshot proof for each isolated session
    await pageA.screenshot({ path: 'proof-session-A.png' });
    await pageB.screenshot({ path: 'proof-session-B.png' });
    console.log('[INFO] Screenshots saved: proof-session-A.png, proof-session-B.png');

    // Cleanup contexts individually
    await contextA.close();
    await contextB.close();
    console.log('[INFO] Both contexts closed.');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
