const puppeteer = require('puppeteer');
const fs = require('fs');

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
    console.log('[INFO] Navigating to table data page...');
    await page.goto('https://the-internet.herokuapp.com/tables', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForSelector('#table1 tbody tr', { timeout: 10000 });

    console.log('[INFO] Extracting raw row data from table#table1...');

    // Extraction runs inside the browser context
    const rawRows = await page.$$eval('#table1 tbody tr', rows => {
      return rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
          lastName: cells[0] ? cells[0].textContent.trim() : '',
          firstName: cells[1] ? cells[1].textContent.trim() : '',
          email: cells[2] ? cells[2].textContent.trim() : '',
          dueRaw: cells[3] ? cells[3].textContent.trim() : '',
          website: cells[4] ? cells[4].textContent.trim() : ''
        };
      });
    });

    console.log(`[INFO] Extracted ${rawRows.length} raw rows. Cleaning and typing data...`);

    // Cleaning and type conversion runs in Node, after extraction
    const cleanedData = rawRows.map(row => {
      const numericDue = parseFloat(row.dueRaw.replace(/[^0-9.]/g, ''));
      return {
        lastName: row.lastName,
        firstName: row.firstName,
        email: row.email.toLowerCase(),
        dueAmount: isNaN(numericDue) ? null : numericDue,
        website: row.website
      };
    });

    console.log('[RESULT] Cleaned structured data:');
    console.log(JSON.stringify(cleanedData, null, 2));

    // Validation pass — explicitly flag rows that fail expected checks
    const invalidRows = cleanedData.filter(
      row => row.dueAmount === null || !row.email.includes('@')
    );
    if (invalidRows.length > 0) {
      console.warn(`[WARN] ${invalidRows.length} row(s) failed validation:`, invalidRows);
    } else {
      console.log('[INFO] All rows passed validation (valid numeric due amount, valid email format).');
    }

    fs.writeFileSync('scraped-table-data.json', JSON.stringify(cleanedData, null, 2));
    console.log('[INFO] Structured data written to scraped-table-data.json');

    await page.screenshot({ path: 'proof-source-table.png' });
    console.log('[INFO] Screenshot saved: proof-source-table.png');

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
    if (page) {
      await page.screenshot({ path: 'proof-scraper-FAILURE-state.png' }).catch(() => {});
    }
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
