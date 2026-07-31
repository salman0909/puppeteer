const puppeteer = require('puppeteer');
const http = require('http');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

// --- Local server: fast HTML shell + delayed <pre> content ---
function startServer(port, delayMs) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    // send head/shell immediately -> domcontentloaded fires here
    res.write(`<html><body><h1>Loading...</h1>`);
    // delay before finishing response -> mimics slow network/backend
    setTimeout(() => {
      res.write(`<pre>{"delayed": "data", "loadedAfterMs": ${delayMs}}</pre>`);
      res.end(`</body></html>`);
    }, delayMs);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

(async () => {
  let browser, server;
  const PORT = 4001;
  const DELAY = 3000;
  try {
    server = await startServer(PORT, DELAY);
    console.log(`[INFO] Local delayed server up on :${PORT}`);

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

    // TEST 1: domcontentloaded — fires early, before delayed <pre> written
    console.log('\n[TEST 1] waitUntil: domcontentloaded');
    const page1 = await browser.newPage();
    const start1 = Date.now();
    await page1.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`[RESULT] domcontentloaded resolved in ${Date.now() - start1}ms`);
    await page1.screenshot({ path: 'proof-domcontentloaded.png' });
    await page1.close();

    // TEST 2: networkidle2 — waits till response fully settles
    console.log('\n[TEST 2] waitUntil: networkidle2');
    const page2 = await browser.newPage();
    const start2 = Date.now();
    await page2.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle2', timeout: 15000 });
    console.log(`[RESULT] networkidle2 resolved in ${Date.now() - start2}ms`);
    await page2.screenshot({ path: 'proof-networkidle2.png' });
    await page2.close();

    // TEST 3: explicit wait for element — most reliable
    console.log('\n[TEST 3] domcontentloaded + explicit waitForSelector');
    const page3 = await browser.newPage();
    const start3 = Date.now();
    await page3.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page3.waitForSelector('pre', { timeout: 15000 });
    console.log(`[RESULT] Explicit element wait resolved in ${Date.now() - start3}ms`);
    const contentText = await page3.evaluate(() => document.querySelector('pre').innerText);
    console.log('[RESULT] Content captured:', contentText);
    await page3.screenshot({ path: 'proof-explicit-wait.png' });
    await page3.close();
  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) { await browser.close(); console.log('\n[INFO] Browser closed cleanly.'); }
    if (server) { server.close(); console.log('[INFO] Local server stopped.'); }
  }
})();
