const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const appUrl = process.env.SALIMA_TEST_URL || 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotDir = process.env.SALIMA_SCREENSHOT_DIR;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const supabaseStub = String.raw`
(() => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const engineerId = '22222222-2222-4222-8222-222222222222';
  const data = {
    products: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'منتج تجريبي', bags_per_pallet: 30, packs_per_bag: 10, units_per_pack: 5, unit_weight_kg: .2, is_active: true }],
    production_records: [], shipments: [], user_permissions: [], user_presence: [], audit_logs: [],
    profiles: [
      { id: ownerId, username: 'owner', full_name: 'مالك النظام', role: 'owner', is_active: true, created_at: new Date().toISOString(), created_by: null, last_login_at: null, last_activity_at: null },
      { id: engineerId, username: 'engineer', full_name: 'مهندس الإنتاج', role: 'engineer', is_active: true, created_at: new Date().toISOString(), created_by: ownerId, last_login_at: null, last_activity_at: null }
    ]
  };
  window.__permissionWrites = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.operation = 'select'; this.payload = null; }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    order() { return this; }
    limit() { return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    upsert(payload) { this.operation = 'upsert'; this.payload = payload; return this; }
    rows() { return (data[this.table] || []).filter(row => this.filters.every(([key, value]) => row[key] === value)); }
    execute() {
      if (this.operation === 'upsert' && this.table === 'user_permissions') {
        window.__permissionWrites.push(...this.payload);
        for (const row of this.payload) {
          const index = data.user_permissions.findIndex(item => item.user_id === row.user_id && item.permission_key === row.permission_key);
          if (index >= 0) data.user_permissions[index] = row; else data.user_permissions.push(row);
        }
      }
      return { data: this.rows(), error: null };
    }
    single() { const result = this.execute(); return Promise.resolve({ data: result.data[0] || null, error: result.data[0] ? null : { message: 'not found' } }); }
    maybeSingle() { const result = this.execute(); return Promise.resolve({ data: result.data[0] || null, error: null }); }
    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  }
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: ownerId } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }), setSession: async () => ({ data: {}, error: null })
    },
    functions: { invoke: async () => ({ data: {}, error: null }) },
    from: table => new Query(table)
  };
  window.supabase = { createClient: () => client };
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'ar' });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseStub }));
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });

  assert.equal(await page.locator('#authScreen').isVisible(), false);
  assert.equal(await page.locator('#sidebar').isVisible(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'desktop page overflows horizontally');
  assert.equal(await page.locator('[data-view="users"]').isVisible(), true);
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'salima-desktop-dashboard.png'), fullPage: true });

  await page.locator('[data-view="users"]').click();
  await page.locator('[data-permissions-user]').nth(1).click();
  await page.locator('#permissionsDialog').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-permission-page]').count(), 25);
  assert.equal(await page.locator('[data-permission-page="users"][data-permission-action="create"]').isEnabled(), false);
  assert.equal(await page.locator('[data-permission-page="users"][data-permission-action="update"]').isEnabled(), false);
  assert.equal(await page.locator('[data-permission-page="shipments"][data-permission-action="view"]').isEnabled(), true);
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'salima-desktop-permissions.png') });
  await page.locator('#permissionsDialog button[value="cancel"]').click();

  await page.locator('[data-permissions-user]').first().click();
  assert.equal(await page.locator('[data-permission-page]:not(:checked)').count(), 0, 'owner permissions must all be checked');
  assert.equal(await page.locator('[data-permission-page]:not(:disabled)').count(), 0, 'owner permissions must all be locked');
  assert.equal(await page.locator('#savePermissionsBtn').isEnabled(), false, 'owner permission save must be disabled');
  await page.locator('#permissionsDialog button[value="cancel"]').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'mobile page overflows horizontally');
  assert.equal(await page.locator('#sidebar').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  await page.locator('#mobileMenu').click();
  assert.equal(await page.locator('#sidebar').evaluate(el => getComputedStyle(el).visibility), 'visible');
  await page.waitForTimeout(300);
  const sidebarBox = await page.locator('#sidebar').evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width }));
  assert(sidebarBox.left >= -1 && sidebarBox.right <= 391 && sidebarBox.width > 250, 'mobile sidebar is outside the viewport');
  await page.locator('[data-view="reports"]').click();
  assert.equal(await page.locator('#view-reports').isVisible(), true);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#sidebar').evaluate(el => getComputedStyle(el).visibility), 'hidden');
  assert.equal(await page.locator('#view-reports .table-scroll').first().evaluate(el => el.scrollWidth >= el.clientWidth), true);
  assert.equal(await page.locator('#view-reports input').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16), true, 'mobile inputs risk browser zoom');
  if (screenshotDir) await page.screenshot({ path: join(screenshotDir, 'salima-mobile-reports.png'), fullPage: true });

  await browser.close();
  console.log('Desktop and mobile UI smoke checks passed at 1440x900 and 390x844.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
