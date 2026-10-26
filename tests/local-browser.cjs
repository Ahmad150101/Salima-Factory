const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const GREEN_LOGO_FILTER = 'sepia(1) saturate(4.5) hue-rotate(90deg) brightness(0.68) contrast(1.05)';
const publicRoot = join(__dirname, '..', 'public');
const contentTypes = {
  'index.html': 'text/html; charset=utf-8',
  'app.js': 'application/javascript; charset=utf-8',
  'erp.js': 'application/javascript; charset=utf-8',
  'config.js': 'application/javascript; charset=utf-8',
  'styles.css': 'text/css; charset=utf-8',
  'erp.css': 'text/css; charset=utf-8',
  'assets/salima-logo.png': 'image/png'
};

// A closed, in-process file server: no socket connection and no external data access.
async function installLocalBrowserRoutes(page, appUrl, stub) {
  page.__unexpectedRequests = [];
  const origin = new URL(appUrl).origin;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4') {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: stub });
    }
    if (url.origin === origin && route.request().method() === 'GET') {
      const asset = decodeURIComponent(url.pathname).replace(/^\//, '') || 'index.html';
      if (Object.hasOwn(contentTypes, asset)) {
        return route.fulfill({ status: 200, contentType: contentTypes[asset], body: readFileSync(join(publicRoot, asset)) });
      }
      if (asset === 'favicon.ico') return route.fulfill({ status: 204, body: '' });
    }
    page.__unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
}

module.exports = { GREEN_LOGO_FILTER, installLocalBrowserRoutes };
