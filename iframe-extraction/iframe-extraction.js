const puppeteer = require('puppeteer');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

(async () => {
  let browser;

  try {
    console.log('[INFO] Launching browser...');

    const launchArgs = ['--start-maximized'];
    if (RUNNING_AS_ROOT_CONTAINER) {
      console.log('[INFO] Root/container detected — adding --no-sandbox.');
      launchArgs.push('--no-sandbox', '--disable-setuid-sandbox');
    }

    browser = await puppeteer.launch({
      headless: HEADLESS_MODE,
      defaultViewport: null,
      args: launchArgs
    });

    const page = await browser.newPage();

    console.log('[INFO] Navigating to iframe test page...');
    await page.goto('https://the-internet.herokuapp.com/iframe', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // --- STEP A: List all frames on the page for identification ---
    const allFrames = page.frames();
    console.log(`[INFO] Total frames found on page: ${allFrames.length}`);
    allFrames.forEach((frame, index) => {
      console.log(
        `  Frame ${index}: url = ${frame.url() || '(main frame - no separate url)'}`
      );
    });

    // --- STEP B: Locate the specific editor iframe by its known name/id pattern ---
    const editorFrame = page.frames().find(frame => frame.name() === 'mce_0_ifr');

    if (!editorFrame) {
      throw new Error('Editor iframe not found — page structure may have changed.');
    }
    console.log('[INFO] Editor iframe located successfully.');

    // --- STEP C: Read existing content FROM inside the iframe ---
    const originalText = await editorFrame.$eval('#tinymce', el => el.innerText);
    console.log('[RESULT] Original iframe content:', originalText);

    // --- STEP D: Interact with iframe content — clear and type new text ---
    await editorFrame.click('#tinymce');
    await editorFrame.evaluate(() => {
      document.querySelector('#tinymce').innerText = '';
    });
    await editorFrame.type(
      '#tinymce',
      'Automated content inserted via Puppeteer frame API.'
    );

    // --- STEP E: Verify the change by reading it back from the iframe ---
    const updatedText = await editorFrame.$eval('#tinymce', el => el.innerText);
    console.log('[RESULT] Updated iframe content:', updatedText);

    // Proof screenshot
    await page.screenshot({ path: 'proof-iframe-content-updated.png' });
    console.log('[INFO] Screenshot saved: proof-iframe-content-updated.png');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
