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
    if (!fs.existsSync('session-cookies.json')) {
      throw new Error('session-cookies.json not found — run save-session.js first.');
    }

    const cookies = JSON.parse(fs.readFileSync('session-cookies.json', 'utf-8'));
    console.log(`[INFO] Loaded ${cookies.length} cookie(s) from session-cookies.json`);

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

    page = await browser.newPage();

    // Open the domain first so Chrome can accept cookies for it
    console.log('[INFO] Opening domain before applying cookies...');
    await page.goto('https://the-internet.herokuapp.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    console.log('[INFO] Applying saved cookies before navigation...');

    // Cookies with expires: -1 represent session cookies as reported by page.cookies().
    // If passed directly to setCookie(), Chrome treats -1 as an already-expired
    // timestamp and silently ignores the cookie. Remove the expires field instead.
    const sanitizedCookies = cookies.map(cookie => {
      const normalizedCookie = {
        ...cookie,
        domain: cookie.domain.replace(/^\./, '')
      };

      if (normalizedCookie.expires === -1) {
        const { expires, ...rest } = normalizedCookie;
        return rest;
      }

      return normalizedCookie;
    });

    await page.setCookie(...sanitizedCookies);

    // DIAGNOSTIC: confirm the cookie actually attached in the browser's own cookie jar
    const appliedCookies = await page.cookies('https://the-internet.herokuapp.com');
    const attachedSessionCookie = appliedCookies.find(c => c.name === 'rack.session');

    console.log('[DEBUG] rack.session cookie present after setCookie?', !!attachedSessionCookie);

    if (attachedSessionCookie) {
      console.log(
        '[DEBUG] Applied value matches saved value?',
        attachedSessionCookie.value ===
          sanitizedCookies.find(c => c.name === 'rack.session')?.value
      );
    }

    console.log('[INFO] Navigating directly to the secure area, without logging in...');
    await page.goto('https://the-internet.herokuapp.com/secure', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // DIAGNOSTIC: where did we actually end up?
    console.log('[DEBUG] Final URL after navigation:', page.url());

    // Verify the restored session is genuinely authenticated.
    // Note: the flash message "You logged into a secure area!" only appears once,
    // immediately after the login POST. It is cleared on subsequent page loads,
    // even while the session remains valid. Check for persistent page elements instead.
    const pageContent = await page.content();
    const isAuthenticated =
      pageContent.includes('Secure Area') &&
      pageContent.includes('Logout');

    if (isAuthenticated) {
      console.log('[RESULT] Session restored successfully — reached secure area without logging in.');
    } else {
      console.log('[RESULT] Session restore FAILED — likely redirected to login. Cookies may have expired.');
    }

    await page.screenshot({ path: 'proof-session-restored.png' });
    console.log('[INFO] Screenshot saved: proof-session-restored.png');

  } catch (error) {
    console.error('[ERROR] Restore session failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('[INFO] Browser closed cleanly.');
    }
  }
})();
