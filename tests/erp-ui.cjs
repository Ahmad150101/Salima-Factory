const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
const { supabaseStub, appUrl, chromePath } = require('./ui-smoke.cjs');
const { GREEN_LOGO_FILTER: greenFilter, installLocalBrowserRoutes } = require('./local-browser.cjs');

const out = process.env.SALIMA_SCREENSHOT_DIR || 'artifacts/ui-complete';
mkdirSync(out, { recursive: true });
const results = { viewports: [], scenarios: [], screenshots: [], errors: [], liveRequests: [] };
const pages = ['dashboard', 'production', 'shipments', 'products', 'records', 'reports', 'users', 'activity', 'system'];

async function scenario(browser, role = 'owner', mode = '') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'ar', reducedMotion: 'reduce' });
  page.__expectedErrors = [];
  page.on('pageerror', error => results.errors.push(error.message));
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    if (mode === 'connection-error' && msg.text().includes('Cloud initialization failed')) page.__expectedErrors.push(msg.text());
    else results.errors.push(msg.text());
  });
  page.on('close', () => results.liveRequests.push(...page.__unexpectedRequests));
  let stub = supabaseStub.replace('user_presence: [], audit_logs: [],', `user_presence: [], audit_logs: [{ id: 'audit-ui-1', user_id: ownerId, action: 'INSERT', entity_type: 'production_records', entity_id: 'eng-current-1', created_at: today + 'T09:15:00Z', old_data: null, new_data: { notes: 'بيانات اختبار محلية فقط' } }],`);
  if (mode === 'login') stub = stub.replace('getSession: async () => ({ data: { session: { user: { id: sessionUserId } } } }),', 'getSession: async () => ({ data: { session: null } }),');
  if (mode === 'connection-error') stub = stub.replace('getSession: async () => ({ data: { session: { user: { id: sessionUserId } } } }),', "getSession: async () => { throw new Error('Isolated connection failure'); },");
  if (mode === 'empty') stub = stub.replace('window.__queryLog = [];', "for (const key of ['products', 'production_records', 'shipments', 'audit_logs']) data[key] = []; window.__queryLog = [];");
  await installLocalBrowserRoutes(page, appUrl, stub);
  await page.goto(`${appUrl}/?role=${role}&size=12&factoryToday=2024-02-10`, { waitUntil: 'networkidle' });
  await page.locator(['login', 'connection-error'].includes(mode) ? '#authScreen:not(.hidden)' : '#appShell:not(.hidden)').waitFor();
  return page;
}

async function navigate(page, name) {
  if (await page.locator(`#view-${name}.active`).count()) return;
  if (await page.locator('#mobileMenu').isVisible()) await page.locator('#mobileMenu').click();
  await page.locator(`[data-view="${name}"]`).click();
  await page.locator(`#view-${name}.active`).waitFor();
  await page.waitForFunction(name => Array.from(document.querySelector(`#view-${name}`).children).every(element => !element.getClientRects().length || Number(getComputedStyle(element).opacity) === 1), name);
  await page.evaluate(() => scrollTo(0, 0));
}

async function theme(page, name) {
  if ((await page.locator('html').getAttribute('data-theme')) !== name) await page.locator('#themeToggle').click();
}

async function layout(page, name, width, mode) {
  const issues = await page.evaluate(({ name }) => {
    const failures = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) failures.push('document overflow');
    const root = name === 'login' ? document.querySelector('#authScreen') : document.querySelector(`#view-${name}`);
    if (innerWidth <= 768 && ['records', 'shipments', 'users', 'activity'].includes(name)) {
      for (const scroller of root.querySelectorAll('.table-scroll')) {
        if (scroller.scrollWidth > scroller.clientWidth + 1) failures.push('responsive cards clipped inside table wrapper');
      }
    }
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    for (const element of root.querySelectorAll('input, select, textarea, button, h2, .stat-card, .workspace-header')) {
      if (!visible(element)) continue;
      const scroller = element.closest('.table-scroll');
      if (scroller && scroller.scrollWidth > scroller.clientWidth) continue;
      const box = element.getBoundingClientRect();
      if (box.left < -1 || box.right > innerWidth + 1) failures.push(`${element.id || element.className}: outside viewport`);
    }
    return failures;
  }, { name });
  assert.deepEqual(issues, [], `${name} ${width}px ${mode}: ${issues.join(', ')}`);
  results.viewports.push(`${name} ${width}px ${mode}`);
}

async function capture(page, name, size, mode, fullPage = false) {
  await page.evaluate(() => scrollTo(0, 0));
  const file = `${name}-${size}-${mode}.png`;
  if (process.env.SALIMA_REUSE_SCREENSHOTS !== '1' || !existsSync(join(out, file))) {
    await page.screenshot({ path: join(out, file), fullPage });
  }
  results.screenshots.push(file);
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const owner = await scenario(browser);
    await navigate(owner, 'production');
    await owner.locator('#addTransparentNylonItem').click();
    await owner.locator('#addPrintedNylonItem').click();
    for (const width of [1440, 768, 430, 390, 360]) {
      await owner.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      for (const mode of ['day', 'night']) {
        await theme(owner, mode);
        for (const name of pages) {
          await navigate(owner, name);
          await layout(owner, name, width, mode);
          if (name === 'production' && width <= 768) {
            for (const selector of ['.roll-code', '.roll-weight', '.roll-note', '#transparentNylonRows input', '#printedNylonRows input', '#wasteWeight', '#wasteType', '#prodNotes', '[data-production-save]']) {
              for (const field of await owner.locator(selector).all()) {
                await field.scrollIntoViewIfNeeded();
                await field.click({ trial: true });
                const bounds = await field.evaluate(el => {
                  const r = el.getBoundingClientRect();
                  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: innerWidth, height: innerHeight };
                });
                assert(bounds.left >= -1 && bounds.right <= bounds.width + 1 && bounds.top >= -1 && bounds.bottom <= bounds.height + 1,
                  `${selector} must be reachable without clipping at ${width}px ${mode}: ${JSON.stringify(bounds)}`);
              }
            }
            assert(await owner.locator('.production-guidance').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 13));
            assert(await owner.locator('[data-production-save]').evaluate(el => el.getBoundingClientRect().height >= 44));
          }
          if (width === 1440 || width === 390) await capture(owner, name, width === 1440 ? 'desktop' : 'mobile-390', mode, name === 'production');
        }
      }
    }
    results.scenarios.push('All nine owner workspaces: 1440/768/430/390/360, light and dark');
    results.scenarios.push('Mobile production fields including both nylon types and save actions are reachable without clipping or pointer interception; supporting copy and touch target sizes verified');

    await navigate(owner, 'reports');
    const reportContrast = await owner.locator('#weeklyDailyTable td').first().evaluate(element => {
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = channels => channels.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
      let ancestor = element;
      while (ancestor.parentElement && getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement;
      const text = luminance(rgb(getComputedStyle(element).color));
      const background = luminance(rgb(getComputedStyle(ancestor).backgroundColor));
      return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
    });
    assert(reportContrast >= 4.5, `night report text contrast ${reportContrast} is below 4.5:1`);
    results.scenarios.push(`Night report text contrast ${reportContrast.toFixed(2)}:1`);

    await owner.setViewportSize({ width: 390, height: 844 });
    await navigate(owner, 'records');
    const record = owner.locator('#recordsTable tr').first();
    assert.equal(await record.evaluate(el => getComputedStyle(el).display), 'grid', 'records must be cards on mobile');
    await record.locator('summary').click();
    assert.equal(await record.locator('details').getAttribute('open'), '');
    assert.match(await record.locator('details').innerText(), /نايلون شفاف|نايلون مطبوع/);
    await capture(owner, 'records-expanded', 'mobile-390', 'night');
    await record.locator('[data-edit-production]').click();
    assert.equal((await owner.locator('#productionModeLabel').innerText()).trim(), 'وضع التعديل');
    assert.equal((await owner.locator('[data-production-save]').innerText()).trim(), 'حفظ التعديل');
    await owner.locator('#cancelProductionEdit').click();
    assert.equal((await owner.locator('[data-production-save]').innerText()).trim(), 'حفظ إنتاج اليوم');
    results.scenarios.push('Mobile record cards, expandable details, existing edit/cancel controls and save proxy');

    await owner.setViewportSize({ width: 1440, height: 960 });
    await navigate(owner, 'products');
    await owner.locator('[data-edit-product]').first().click();
    assert.equal((await owner.locator('[data-product-editor-state]').innerText()).trim(), 'تعديل');
    await capture(owner, 'products-edit', 'desktop', 'night');
    await owner.locator('#cancelProductEdit').click();
    await navigate(owner, 'shipments');
    await owner.locator('[data-edit-shipment]').first().click();
    assert.equal((await owner.locator('#shipmentFormTitle').innerText()).trim(), 'تعديل الشحنة');
    await owner.locator('#cancelShipmentEdit').click();
    await owner.locator('#shipmentSearch').fill('SHIP-0');
    assert.equal(await owner.locator('#shipmentsTable tr').count(), 1);
    await owner.locator('#shipmentSearch').fill('');
    await navigate(owner, 'users');
    await owner.locator('[data-permissions-user]').first().click();
    assert.equal(await owner.locator('#permissionsDialog').isVisible(), true);
    await capture(owner, 'permissions', 'desktop', 'night');
    await owner.locator('#permissionsDialog button[value="cancel"]').click();
    await owner.setViewportSize({ width: 390, height: 844 });
    await owner.locator('[data-permissions-user]').first().click();
    await capture(owner, 'permissions', 'mobile-390', 'night');
    await owner.locator('#permissionsDialog button[value="cancel"]').click();
    await navigate(owner, 'activity');
    owner.once('dialog', dialog => dialog.dismiss());
    await owner.locator('[data-audit-detail]').click();
    await owner.locator('#auditAction').selectOption('DELETE');
    assert.equal(await owner.locator('#auditTable .empty-state').isVisible(), true);
    results.scenarios.push('Product and shipment edit/cancel; shipment search; permission dialogs; activity details/filter');
    await owner.close();

    const engineer = await scenario(browser, 'engineer');
    for (const forbidden of ['shipments', 'products', 'users', 'activity', 'system']) assert.equal(await engineer.locator(`[data-view="${forbidden}"]`).isVisible(), false);
    for (const width of [1440, 768, 430, 390, 360]) {
      await engineer.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      for (const mode of ['day', 'night']) {
        await theme(engineer, mode);
        await navigate(engineer, 'reports');
        await layout(engineer, 'reports', width, mode);
        assert.equal(await engineer.locator('#printableWeeklyReport').isVisible(), false);
        if (width === 1440 || width === 390) await capture(engineer, 'engineer-weekly-report', width === 1440 ? 'desktop' : 'mobile-390', mode);
      }
    }
    await navigate(engineer, 'production');
    await engineer.locator('[data-production-save]').click();
    assert.equal(await engineer.locator('.roll-code.field-error').count(), 1, 'proxy must use original validation');
    await engineer.locator('.roll-code').fill('UI-ISOLATED');
    await engineer.locator('.roll-weight').fill('25');
    await engineer.locator('#palletsProduced').fill('2');
    await engineer.locator('#extraBags').fill('1');
    await engineer.locator('#wasteWeight').fill('0');
    await engineer.locator('#prodNotes').fill('اختبار محلي معزول');
    await engineer.locator('[data-production-save]').click();
    await engineer.locator('#engineerSaveDialog button[value="cancel"]').click();
    assert.equal(await engineer.evaluate(() => window.__productionWrites.length), 0);
    await engineer.locator('[data-production-save]').click();
    await engineer.locator('#engineerSaveDialog button[value="confirm"]').click();
    await engineer.locator('#view-dashboard.active').waitFor();
    assert.equal(await engineer.evaluate(() => window.__productionWrites.length), 1);
    assert.equal(await engineer.evaluate(() => window.__productionWrites[0].pallets), 2);
    results.scenarios.push('Engineer scope and weekly report all sizes/themes; original validation, cancel and confirmation save in isolated fixture');
    await engineer.close();

    const admin = await scenario(browser, 'admin');
    for (const forbidden of ['users', 'activity', 'system']) assert.equal(await admin.locator(`[data-view="${forbidden}"]`).isVisible(), false);
    for (const name of ['shipments', 'products', 'reports', 'records']) { await navigate(admin, name); await layout(admin, name, 1440, 'day'); }
    results.scenarios.push('Admin navigation and management scope unchanged');
    await admin.close();

    const login = await scenario(browser, 'owner', 'login');
    for (const width of [1440, 768, 430, 390, 360]) {
      await login.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      for (const mode of ['day', 'night']) {
        // Theme setup is isolated test state, not an application auth change.
        await login.evaluate(mode => document.documentElement.dataset.theme = mode, mode);
        await layout(login, 'login', width, mode);
        assert.equal(await login.locator('.auth-brand-logo').evaluate(el => getComputedStyle(el).filter), greenFilter);
        if (width === 1440 || width === 390) await capture(login, 'login', width === 1440 ? 'desktop' : 'mobile-390', mode);
      }
    }
    assert.equal(await login.locator('#loginBtn').isEnabled(), true);
    assert.match(await login.locator('#authMessage').innerText(), /أدخل اسم المستخدم/);
    await login.locator('#loginUsername').fill('local_test');
    await login.locator('#loginPassword').fill('invalid-test-password');
    await login.locator('#loginBtn').click();
    assert.match(await login.locator('#authMessage').innerText(), /غير صحيحة/);
    assert.equal(await login.locator('#loginBtn').isEnabled(), true);
    await capture(login, 'login-validation', 'mobile-360', 'night');
    results.scenarios.push('Login ready state, green logo and layout at every size/theme');
    await login.close();

    const failedConnection = await scenario(browser, 'owner', 'connection-error');
    assert.match(await failedConnection.locator('#authMessage').innerText(), /تعذر تهيئة الاتصال/);
    assert.equal(await failedConnection.locator('#authMessage.loading').count(), 0);
    assert.equal(await failedConnection.locator('#loginBtn').isEnabled(), false);
    assert.equal(failedConnection.__expectedErrors.length, 1, 'the injected connection failure must be reported once');
    await capture(failedConnection, 'login-connection-error', 'desktop', 'day');
    await failedConnection.close();
    results.scenarios.push('Injected connection failure leaves loading state and presents recovery message; invalid-login message stays usable');

    const empty = await scenario(browser, 'owner', 'empty');
    for (const name of ['dashboard', 'production', 'shipments', 'products', 'records', 'reports', 'activity']) {
      await navigate(empty, name);
      await layout(empty, name, 1440, 'day');
      await capture(empty, `${name}-empty`, 'desktop', 'day');
    }
    await navigate(empty, 'production');
    assert.equal(await empty.locator('#saveProductionBtn').isEnabled(), false);
    assert.equal(await empty.locator('[data-production-save]').isEnabled(), false);
    results.scenarios.push('Empty data renders without fabricated values and save stays disabled without products');
    await empty.close();

    const print = await scenario(browser);
    await navigate(print, 'reports');
    await print.emulateMedia({ media: 'print' });
    await print.pdf({ path: join(out, 'weekly-report-print.pdf'), format: 'A4', landscape: true, printBackground: true });
    results.scenarios.push('A4 landscape report PDF generated from existing report values');
    await print.close();

    assert.deepEqual(results.errors, [], 'browser console/page errors');
    assert.deepEqual(results.liveRequests, [], 'tests must not call live Supabase');
    writeFileSync(join(out, 'verification.json'), JSON.stringify(results, null, 2));
    console.log(`ERP verification passed: ${results.viewports.length} page/viewport/theme checks, ${results.screenshots.length} screenshots, ${results.scenarios.length} scenario groups, no browser errors or live Supabase requests.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
