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
    await page.goto('https://the-internet.herokuapp.com/tables', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('#table1', { timeout: 10000 });

    // === DELIVERABLE 1: Viewport-only screenshot ===
    console.log('\n[INFO] Generating viewport-only screenshot...');
    await page.screenshot({
      path: 'report-viewport-only.png',
      type: 'png',
      fullPage: false
    });
    console.log('[INFO] Saved: report-viewport-only.png');

    // === DELIVERABLE 2: Full-page screenshot ===
    console.log('[INFO] Generating full-page screenshot...');
    await page.screenshot({
      path: 'report-full-page.png',
      type: 'png',
      fullPage: true
    });
    console.log('[INFO] Saved: report-full-page.png');

    // === DELIVERABLE 3: Clipped region screenshot table only ===
    console.log('[INFO] Locating table element for clipped capture...');
    const tableElement = await page.$('#table1');
    const boundingBox = await tableElement.boundingBox();
    await page.screenshot({
      path: 'report-table-only.png',
      type: 'png',
      clip: {
        x: boundingBox.x,
        y: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height
      }
    });
    console.log('[INFO] Saved: report-table-only.png');

    // === DELIVERABLE 4: Formatted PDF report ===
    console.log('\n[INFO] Generating formatted PDF report...');
    await page.pdf({
      path: 'report-full-page.pdf',
      format: 'A4',
      printBackground: true,
      margin: { top: '60px', bottom: '60px', left: '40px', right: '40px' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9px; width:100%; text-align:center; color:#555;">Automated Report Puppeteer Course</div>`,
      footerTemplate: `<div style="font-size:9px; width:100%; text-align:center; color:#555;">Page <span class="pageNumber"></span> of <span class="totalPages"></span> — Generated ${new Date().toISOString()}</div>`
    });
    console.log('[INFO] Saved: report-full-page.pdf');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'proof-report-FAILURE-state.png' }).catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n[INFO] Browser closed cleanly.');
    }
  }
})();
