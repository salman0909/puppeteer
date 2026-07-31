const puppeteer = require('puppeteer');

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
