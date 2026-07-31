const puppeteer = require('puppeteer');
const express = require('express');
const cookieParser = require('cookie-parser');

const HEADLESS_MODE = false;
const RUNNING_AS_ROOT_CONTAINER =
  process.env.CI === 'true' ||
  process.env.DOCKER_CONTAINER === 'true' ||
  (typeof process.getuid === 'function' && process.getuid() === 0);

// --- Local test server: sets + shows cookies ---
function startServer(port) {
  const app = express();
  app.use(cookieParser());
  app.get('/set-cookie', (req, res) => {
    res.cookie('session', req.query.session, { httpOnly: false });
    res.send(`Cookie set: ${req.query.session}`);
  });
  app.get('/show-cookies', (req, res) => {
    res.send(`Cookies seen: ${JSON.stringify(req.cookies)}`);
  });
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}

(async () => {
  let browser, server;
  const PORT = 4000;
  try {
    server = await startServer(PORT);
    console.log(`[INFO] Local test server up on :${PORT}`);

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

    // SESSION A
    console.log('[INFO] Creating isolated context for Session A...');
    const contextA = await browser.createBrowserContext();
    const pageA = await contextA.newPage();
    await pageA.goto(`http://localhost:${PORT}/set-cookie?session=UserA-Session`, { waitUntil: 'networkidle2' });
    console.log('[INFO] Session A cookie set.');

    // SESSION B
    console.log('[INFO] Creating isolated context for Session B...');
    const contextB = await browser.createBrowserContext();
    const pageB = await contextB.newPage();
    await pageB.goto(`http://localhost:${PORT}/set-cookie?session=UserB-Session`, { waitUntil: 'networkidle2' });
    console.log('[INFO] Session B cookie set.');

    // VERIFY
    await pageA.goto(`http://localhost:${PORT}/show-cookies`, { waitUntil: 'networkidle2' });
    await pageB.goto(`http://localhost:${PORT}/show-cookies`, { waitUntil: 'networkidle2' });

    const cookiesSeenByA = await pageA.evaluate(() => document.body.innerText);
    const cookiesSeenByB = await pageB.evaluate(() => document.body.innerText);
    console.log('[RESULT] Session A sees:', cookiesSeenByA);
    console.log('[RESULT] Session B sees:', cookiesSeenByB);

    await pageA.screenshot({ path: 'proof-session-A.png' });
    await pageB.screenshot({ path: 'proof-session-B.png' });
    console.log('[INFO] Screenshots saved.');

    await contextA.close();
    await contextB.close();
    console.log('[INFO] Both contexts closed.');
  } catch (error) {
    console.error('[ERROR] Lab failed:', error.message);
  } finally {
    if (browser) { await browser.close(); console.log('[INFO] Browser closed cleanly.'); }
    if (server) { server.close(); console.log('[INFO] Local server stopped.'); }
  }
})();
