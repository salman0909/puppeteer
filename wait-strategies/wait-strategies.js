const puppeteer = require('puppeteer');
const http = require('http');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

// --- Local server: instant HTML shell + separately delayed /data endpoint ---
function startServer(port, delayMs) {
  const server = http.createServer((req, res) => {
    if (req.url === '/data') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ delayed: 'data', loadedAfterMs: delayMs }));
      }, delayMs);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body>
        <h1>Loading...</h1>
        <pre id="result">waiting...</pre>
        <script>
          fetch('/data')
            .then(r => r.json())
            .then(data => {
              document.getElementById('result').innerText = JSON.stringify(data);
            });
        </script>
      </body></html>
    `);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

(async () => {
  let browser, server;
  const PORT = 4001;
  const DELAY = 3000;

  try {
    server = await startServer(PORT, DELAY);
    console.log(`[INFO] Local delayed-content server up on :${PORT}`);

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

    // === TEST 1: domcontentloaded — resolves as soon as HTML is parsed ===
    // Proves: DOM being "ready" does NOT mean your actual content has arrived.
    console.log('\n[TEST 1] waitUntil: domcontentloaded (naive wait)');
    const page1 = await browser.newPage();
    const start1 = Date.now();
    await page1.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    console.log(`[RESULT] domcontentloaded resolved in ${Date.now() - start1}ms`);
    const text1 = await page1.$eval('#result', el => el.textContent);
    console.log('[RESULT] Content captured at this point:', text1);
    await page1.screenshot({ path: 'proof-naive-wait.png' });
    await page1.close();

    // === TEST 2: explicit content-based wait — reliable regardless of network timing ===
    // Proves: waiting for the ACTUAL content you need is the only guaranteed-correct approach.
    console.log('\n[TEST 2] domcontentloaded + explicit waitForFunction on real content');
    const page2 = await browser.newPage();
    const start2 = Date.now();
    await page2.goto(`http://localhost:${PORT}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page2.waitForFunction(
      () => document.getElementById('result').innerText !== 'waiting...',
      { timeout: 15000 }
    );
    console.log(`[RESULT] Explicit content wait resolved in ${Date.now() - start2}ms`);
    const text2 = await page2.$eval('#result', el => el.textContent);
    console.log('[RESULT] Content captured at this point:', text2);
    await page2.screenshot({ path: 'proof-explicit-wait.png' });
    await page2.close();

  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) { await browser.close(); console.log('\n[INFO] Browser closed cleanly.'); }
    if (server) { server.close(); console.log('[INFO] Local server stopped.'); }
  }
})();
