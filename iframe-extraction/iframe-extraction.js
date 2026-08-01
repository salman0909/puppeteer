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

    page = await browser.newPage();

    console.log('[INFO] Navigating to iframe test page...');

    await page.goto('https://the-internet.herokuapp.com/iframe', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });


    // STEP A: Wait for iframe element
    console.log('[INFO] Waiting for iframe element to attach to DOM...');

    const iframeElementHandle = await page.waitForSelector('#mce_0_ifr', {
      timeout: 15000
    });


    // STEP B: Convert iframe element into Puppeteer Frame object
    const editorFrame = await iframeElementHandle.contentFrame();

    if (!editorFrame) {
      throw new Error('Could not resolve iframe content frame.');
    }

    console.log('[INFO] Editor iframe located successfully.');


    // STEP C: Wait for editor body inside iframe

    await editorFrame.waitForSelector('#tinymce', {
      timeout: 15000
    });


    // STEP D: Extract existing iframe content

    const originalText = await editorFrame.$eval(
      '#tinymce',
      el => el.innerText
    );

    console.log('[RESULT] Original iframe content:', originalText);



    // STEP E: Update content inside iframe
    // TinyMCE manages its own editor state, so update the DOM directly

    const newContent =
      'Automated content inserted via Puppeteer frame API.';

    await editorFrame.evaluate((text) => {

      const editor = document.querySelector('#tinymce');

      if (!editor) {
        throw new Error('TinyMCE editor body not found.');
      }

      editor.innerHTML = text;

      // Trigger input event so the editor detects the change
      editor.dispatchEvent(
        new Event('input', { bubbles: true })
      );

      editor.dispatchEvent(
        new Event('change', { bubbles: true })
      );

    }, newContent);



    // STEP F: Verify updated iframe content

    const updatedText = await editorFrame.$eval(
      '#tinymce',
      el => el.innerText
    );

    console.log('[RESULT] Updated iframe content:', updatedText);



    // Screenshot proof

    await page.screenshot({
      path: 'proof-iframe-content-updated.png'
    });

    console.log('[INFO] Screenshot saved: proof-iframe-content-updated.png');


  } catch (error) {

    console.error('[ERROR] Lab failed:', error.message);

    if (page) {
      try {
        await page.screenshot({
          path: 'proof-iframe-FAILURE-state.png'
        });

        console.log('[INFO] Failure-state screenshot saved.');

      } catch (screenshotError) {
        console.error(
          '[ERROR] Could not capture failure screenshot:',
          screenshotError.message
        );
      }
    }

  } finally {

    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }

  }

})();
