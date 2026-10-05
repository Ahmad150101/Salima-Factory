const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const appUrl = process.env.SALIMA_TEST_URL || 'http://127.0.0.1:4173';
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const screenshotDir = process.env.SALIMA_SCREENSHOT_DIR;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

const ownerId = '11111111-1111-4111-8111-111111111111';

const supabaseStub = String.raw`
(() => {
  const params = new URLSearchParams(location.search);
  const sessionRole = params.get('role') || 'owner';
  const recordCount = Math.max(4, Number(params.get('size') || 1005));
  const recordsOnly = params.get('recordsOnly') === '1';
  const emptyWeek = params.get('emptyWeek') === '1';
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const engineerId = '22222222-2222-4222-8222-222222222222';
  const adminId = '33333333-3333-4333-8333-333333333333';
  const sessionUserId = sessionRole === 'engineer' ? engineerId : sessionRole === 'admin' ? adminId : ownerId;
  const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hebron', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
  function shiftIso(iso, days) {
    const date = new Date(iso + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }
  const todayDate = new Date(today + 'T12:00:00Z');
  const weekStart = shiftIso(today, -((todayDate.getUTCDay() + 1) % 7));
  const weekEnd = shiftIso(weekStart, 6);

  function productionRow(id, date, createdBy, code, pallets = 2) {
    return {
      id, production_date: date, shift: 'صباحية', product_id: productId,
      product_snapshot: { id: productId, name: 'منتج تجريبي', bagsPerPallet: 30, packsPerBag: 10, unitsPerPack: 5, unitWeightKg: .2 },
      rolls: [{ code, weight: 12.5, note: '' }], pallets, extra_bags: 0,
      transparent_nylon_weight: 1, printed_nylon_mode: 'weight',
      printed_nylon_weight: 2.5, printed_nylon_rolls: 1,
      waste_weight: .5, waste_type: 'قص', notes: 'اختبار', created_by: createdBy,
      updated_by: null, created_at: date + 'T08:00:00Z', updated_at: date + 'T08:00:00Z'
    };
  }

  const productionRecords = sessionRole === 'engineer'
    ? (emptyWeek ? [
        productionRow('eng-old', shiftIso(weekStart, -1), engineerId, 'ENG-OLD'),
        productionRow('other-current', today, ownerId, 'OTHER-CURRENT')
      ] : [
        productionRow('eng-current-1', weekStart, engineerId, 'ENG-CURRENT-1'),
        productionRow('eng-current-2', today, engineerId, 'ENG-CURRENT-2'),
        productionRow('eng-old', shiftIso(weekStart, -1), engineerId, 'ENG-OLD'),
        productionRow('other-current', today, ownerId, 'OTHER-CURRENT')
      ])
    : Array.from({ length: recordCount }, (_, index) => {
        const date = index === 0 ? '2024-01-15' : index === 1 ? '2024-01-16' : shiftIso('2024-02-01', index % 700);
        return productionRow('production-' + String(index).padStart(5, '0'), date, index % 2 ? engineerId : ownerId, 'ROLL-' + index, 1 + (index % 4));
      });

  const shipments = Array.from({ length: sessionRole === 'engineer' ? 4 : recordCount }, (_, index) => ({
    id: 'shipment-' + String(index).padStart(5, '0'),
    shipment_date: index === 0 ? '2024-01-15' : shiftIso('2024-02-01', index % 700),
    supplier: 'مورد ' + index, container_count: 1, roll_count: 10,
    total_weight: 100, reference: 'SHIP-' + index, notes: '',
    created_by: ownerId, updated_by: null, created_at: '2024-01-01T08:00:00Z', updated_at: '2024-01-01T08:00:00Z'
  }));

  const permissions = recordsOnly ? [
    { user_id: engineerId, permission_key: 'production.view', allowed: false },
    { user_id: engineerId, permission_key: 'production.create', allowed: false },
    { user_id: engineerId, permission_key: 'production.update', allowed: false }
  ] : [];

  const data = {
    products: [{ id: productId, name: 'منتج تجريبي', bags_per_pallet: 30, packs_per_bag: 10, units_per_pack: 5, unit_weight_kg: .2, is_active: true }],
    production_records: productionRecords,
    shipments,
    user_permissions: permissions,
    user_presence: [], audit_logs: [],
    profiles: [
      { id: ownerId, username: 'owner', full_name: 'مالك النظام', role: 'owner', is_active: true, created_at: '2024-01-01T00:00:00Z', created_by: null, last_login_at: null, last_activity_at: null },
      { id: adminId, username: 'admin', full_name: 'مدير المصنع', role: 'admin', is_active: true, created_at: '2024-01-02T00:00:00Z', created_by: ownerId, last_login_at: null, last_activity_at: null },
      { id: engineerId, username: 'engineer', full_name: 'مهندس الإنتاج', role: 'engineer', is_active: true, created_at: '2024-01-03T00:00:00Z', created_by: ownerId, last_login_at: null, last_activity_at: null }
    ]
  };

  window.__queryLog = [];
  window.__permissionWrites = [];
  window.__fixture = { today, weekStart, weekEnd, recordCount, sessionRole };

  function permissionAllowed(key) {
    const override = data.user_permissions.find(row => row.user_id === sessionUserId && row.permission_key === key);
    if (override) return override.allowed === true;
    if (sessionRole === 'owner') return true;
    if (sessionRole === 'admin') return ['shipments.view', 'reports.view', 'records.view'].includes(key);
    return ['reports.view', 'records.view', 'records.update', 'production.view', 'production.create', 'production.update'].includes(key);
  }

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.orders = [];
      this.operation = 'select';
      this.payload = null;
      this.rangeBounds = null;
      this.limitCount = null;
    }
    select() { return this; }
    eq(key, value) { this.filters.push({ operator: 'eq', key, value }); return this; }
    gte(key, value) { this.filters.push({ operator: 'gte', key, value }); return this; }
    lte(key, value) { this.filters.push({ operator: 'lte', key, value }); return this; }
    order(key, options = {}) { this.orders.push({ key, ascending: options.ascending !== false }); return this; }
    limit(value) { this.limitCount = value; return this; }
    range(from, to) { this.rangeBounds = [from, to]; return this; }
    insert(payload) { this.operation = 'insert'; this.payload = payload; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    upsert(payload) { this.operation = 'upsert'; this.payload = payload; return this; }
    rows() {
      let rows = [...(data[this.table] || [])];
      if (sessionRole === 'engineer' && this.table === 'production_records') {
        rows = rows.filter(row => row.created_by === engineerId && row.production_date >= weekStart && row.production_date <= today);
      }
      if (sessionRole === 'engineer' && this.table === 'shipments' && !permissionAllowed('shipments.view')) rows = [];
      if (sessionRole === 'engineer' && this.table === 'user_permissions') rows = rows.filter(row => row.user_id === engineerId);
      rows = rows.filter(row => this.filters.every(filter => {
        if (filter.operator === 'eq') return row[filter.key] === filter.value;
        if (filter.operator === 'gte') return row[filter.key] >= filter.value;
        if (filter.operator === 'lte') return row[filter.key] <= filter.value;
        return true;
      }));
      if (this.orders.length) {
        rows.sort((left, right) => {
          for (const order of this.orders) {
            const a = left[order.key] == null ? '' : left[order.key];
            const b = right[order.key] == null ? '' : right[order.key];
            if (a === b) continue;
            const direction = a < b ? -1 : 1;
            return order.ascending ? direction : -direction;
          }
          return 0;
        });
      }
      return rows;
    }
    execute() {
      window.__queryLog.push({
        table: this.table,
        operation: this.operation,
        filters: this.filters.map(filter => ({ ...filter })),
        range: this.rangeBounds ? [...this.rangeBounds] : null
      });
      if (this.operation === 'upsert' && this.table === 'user_permissions') {
        window.__permissionWrites.push(...this.payload);
        for (const row of this.payload) {
          const index = data.user_permissions.findIndex(item => item.user_id === row.user_id && item.permission_key === row.permission_key);
          if (index >= 0) data.user_permissions[index] = row; else data.user_permissions.push(row);
        }
      }
      let rows = this.rows();
      if (this.rangeBounds) rows = rows.slice(this.rangeBounds[0], this.rangeBounds[1] + 1);
      else if (this.limitCount != null) rows = rows.slice(0, this.limitCount);
      else rows = rows.slice(0, 1000);
      return { data: rows, error: null };
    }
    single() {
      const result = this.execute();
      return Promise.resolve({ data: result.data[0] || null, error: result.data[0] ? null : { message: 'not found' } });
    }
    maybeSingle() {
      const result = this.execute();
      return Promise.resolve({ data: result.data[0] || null, error: null });
    }
    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  }

  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: sessionUserId } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      setSession: async () => ({ data: {}, error: null })
    },
    functions: { invoke: async () => ({ data: {}, error: null }) },
    from: table => new Query(table)
  };
  window.supabase = { createClient: () => client };
})();`;

async function openScenario(browser, { role, size = 1005, recordsOnly = false, emptyWeek = false, viewport = { width: 1440, height: 900 } }) {
  const page = await browser.newPage({ viewport, locale: 'ar' });
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: supabaseStub }));
  const query = new URLSearchParams({ role, size: String(size) });
  if (recordsOnly) query.set('recordsOnly', '1');
  if (emptyWeek) query.set('emptyWeek', '1');
  await page.goto(`${appUrl}/?${query}`, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });
  return page;
}

async function assertDateFilter(page, expectedTotal) {
  await page.locator('[data-view="records"]').click();
  await page.locator('#recordDateFilter').fill('2024-01-15');
  await page.locator('#recordDateFilter').dispatchEvent('change');
  assert.equal(await page.locator('#recordsTable > tr').count(), 1, 'date filter must show one day only');
  assert.match(await page.locator('#recordsTable').innerText(), /ROLL-0/);
  await page.locator('#recordSearch').fill('ROLL-1');
  assert.equal(await page.locator('#recordsTable .empty-state').isVisible(), true, 'text search must combine with date filter');
  await page.locator('#recordSearch').fill('');
  await page.locator('#clearRecordDateFilter').click();
  assert.equal(await page.locator('#recordsTable > tr').count(), expectedTotal, 'clear date must restore all historical records');
  assert.match(await page.locator('#recordsScopeNote').innerText(), /دون قيد أسبوعي/);
}

async function assertDesktopRecordsLayout(page) {
  const boxes = await Promise.all([
    page.locator('.records-scope').boundingBox(),
    page.locator('.records-toolbar').boundingBox(),
    page.locator('#recordSearch').boundingBox(),
    page.locator('#recordDateFilter').boundingBox(),
    page.locator('#clearRecordDateFilter').boundingBox()
  ]);
  boxes.forEach(box => assert(box, 'desktop records layout element is missing'));
  const [scope, toolbar, search, date, clear] = boxes;
  assert(scope.y + scope.height <= toolbar.y + 1, 'records scope should sit directly above the desktop filters');
  const bottoms = [search, date, clear].map(box => box.y + box.height);
  assert(Math.max(...bottoms) - Math.min(...bottoms) <= 3, 'desktop search, date, and clear button must align in one row');
  assert(search.width > date.width, 'desktop search should use the flexible space without a large middle gap');
}

async function assertMobileRecordsLayout(page) {
  const boxes = await Promise.all([
    page.locator('.records-toolbar').boundingBox(),
    page.locator('#recordSearch').boundingBox(),
    page.locator('#recordDateFilter').boundingBox(),
    page.locator('#clearRecordDateFilter').boundingBox()
  ]);
  boxes.forEach(box => assert(box, 'mobile records layout element is missing'));
  const [toolbar, search, date, clear] = boxes;
  for (const box of [search, date, clear]) assert(Math.abs(box.width - toolbar.width) <= 2, 'mobile records controls must use the full width');
  assert(search.y + search.height <= date.y, 'mobile date must appear below search');
  assert(date.y + date.height <= clear.y, 'mobile clear button must appear below date');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'mobile records page overflows horizontally');
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  const owner = await openScenario(browser, { role: 'owner', size: 1005 });
  assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'owner desktop page overflows horizontally');
  assert.equal(await owner.locator('[data-view="users"]').isVisible(), true);
  const ownerRanges = await owner.evaluate(() => Object.fromEntries(['production_records', 'shipments'].map(table => [table, window.__queryLog.filter(entry => entry.table === table && entry.operation === 'select').map(entry => entry.range)])));
  assert.deepEqual(ownerRanges.production_records, [[0, 499], [500, 999], [1000, 1499]], 'production pagination must pass 1000 rows');
  assert.deepEqual(ownerRanges.shipments, [[0, 499], [500, 999], [1000, 1499]], 'shipment pagination must pass 1000 rows');
  assert.equal((await owner.locator('#reportsNavLabel').innerText()).trim(), 'التقارير', 'owner reports label must stay unchanged');
  await assertDateFilter(owner, 1005);
  await assertDesktopRecordsLayout(owner);
  if (screenshotDir) await owner.screenshot({ path: join(screenshotDir, 'salima-owner-desktop-records-polished.png') });
  await owner.locator('[data-view="reports"]').click();
  await owner.locator('#reportFrom').fill('2024-01-01');
  await owner.locator('#reportTo').fill('2026-12-31');
  await owner.locator('#refreshReport').click();
  assert.match(await owner.locator('#reportPeriodLabel').innerText(), /2024|٢٠٢٤/);
  assert.equal(await owner.locator('#printableWeeklyReport').isVisible(), true);
  assert.equal(await owner.locator('#engineerWeeklyReport').isVisible(), false);
  if (screenshotDir) await owner.screenshot({ path: join(screenshotDir, 'salima-owner-desktop-report.png') });
  await owner.locator('[data-view="users"]').click();
  await owner.locator(`[data-permissions-user="${ownerId}"]`).click();
  assert.equal(await owner.locator('[data-permission-page]:not(:checked)').count(), 0, 'owner permissions must all be checked');
  assert.equal(await owner.locator('[data-permission-page]:not(:disabled)').count(), 0, 'owner permissions must all be locked');
  await owner.locator('#permissionsDialog button[value="cancel"]').click();
  await owner.close();

  const admin = await openScenario(browser, { role: 'admin', size: 20 });
  assert.equal((await admin.locator('#reportsNavLabel').innerText()).trim(), 'التقارير', 'admin reports label must stay unchanged');
  await assertDateFilter(admin, 20);
  assert.equal(await admin.locator('[data-edit-production]').count(), 20, 'admin must be able to edit historical records');
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.reload({ waitUntil: 'networkidle' });
  await admin.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });
  await admin.locator('#mobileMenu').click();
  await admin.locator('[data-view="records"]').click();
  await admin.waitForTimeout(300);
  await assertMobileRecordsLayout(admin);
  if (screenshotDir) await admin.screenshot({ path: join(screenshotDir, 'salima-admin-mobile-records-polished.png'), fullPage: true });
  await admin.close();

  const engineer = await openScenario(browser, { role: 'engineer', size: 20 });
  assert.equal(await engineer.locator('[data-view="reports"]').isVisible(), true, 'engineer must see reports navigation');
  assert.equal((await engineer.locator('#reportsNavLabel').innerText()).trim(), 'التقرير الأسبوعي', 'engineer navigation must say weekly report');
  assert.equal(await engineer.locator('[data-view="shipments"]').isVisible(), false, 'engineer must not see shipments by default');
  assert.equal(await engineer.evaluate(() => window.__queryLog.some(entry => entry.table === 'shipments')), false, 'reports.view alone must not query shipments');
  const engineerProductionQuery = await engineer.evaluate(() => window.__queryLog.find(entry => entry.table === 'production_records'));
  assert(engineerProductionQuery.filters.some(filter => filter.operator === 'eq' && filter.key === 'created_by'), 'engineer query must request own rows only');
  assert(engineerProductionQuery.filters.some(filter => filter.operator === 'gte' && filter.key === 'production_date'), 'engineer query must start on Saturday');
  assert(engineerProductionQuery.filters.some(filter => filter.operator === 'lte' && filter.key === 'production_date'), 'engineer query must stop today');
  await engineer.locator('[data-view="reports"]').click();
  assert.equal(await engineer.locator('#engineerWeeklyReport').isVisible(), true);
  assert.equal(await engineer.locator('#refreshEngineerWeeklyReport').isVisible(), true, 'engineer weekly refresh button must be visible');
  assert.match(await engineer.locator('#engineerReportPeriodLabel').innerText(), /^من السبت .+ إلى الجمعة .+$/);
  await engineer.locator('#engineerReportPallets').evaluate(element => { element.textContent = 'قديم'; });
  await engineer.locator('#refreshEngineerWeeklyReport').click();
  assert.notEqual((await engineer.locator('#engineerReportPallets').innerText()).trim(), 'قديم', 'weekly report button must refresh the summary');
  assert.equal(await engineer.locator('#engineerReportEmpty').isVisible(), false, 'non-empty engineer week must not show the empty message');
  assert.equal(await engineer.locator('#engineerWeeklyReport .stat-card').count(), 4, 'engineer report must contain exactly four metrics');
  assert.equal(await engineer.locator('#printableWeeklyReport').isVisible(), false, 'management report must be hidden from engineer');
  assert.equal(await engineer.locator('.monthly-reconciliation').isVisible(), false, 'reconciliation must be hidden from engineer');
  assert.equal(await engineer.locator('#exportEngineerWeeklyCsv').isVisible(), false, 'engineer export must default off');
  assert.equal(await engineer.locator('#printEngineerWeeklyReport').isVisible(), false, 'engineer print must default off');
  const engineerReportText = await engineer.locator('#engineerWeeklyReport').innerText();
  for (const forbidden of ['وزن الرولات', 'التوالف', 'نايلون شفاف', 'الشحنات', 'الموردين', 'الرصيد', 'الوارد']) assert.equal(engineerReportText.includes(forbidden), false, `engineer report leaked: ${forbidden}`);
  await engineer.waitForTimeout(400);
  if (screenshotDir) await engineer.screenshot({ path: join(screenshotDir, 'salima-engineer-desktop-weekly-report.png') });
  await engineer.locator('[data-view="records"]').click();
  assert.match(await engineer.locator('#recordsScopeNote').innerText(), /الأسبوع الحالي.*السبت/);
  assert.equal(await engineer.locator('[data-edit-production]').count(), 2, 'engineer must see only own current-week records');
  assert.equal(await engineer.locator('[data-delete-production]').count(), 0, 'engineer must never see delete');
  assert.equal((await engineer.locator('#recordsTable').innerText()).includes('ENG-OLD'), false, 'previous-week engineer record must stay hidden');
  await engineer.locator('#recordSearch').fill('ENG-CURRENT-1');
  assert.equal(await engineer.locator('[data-edit-production]').count(), 1, 'engineer search must stay inside current-week rows');
  await engineer.locator('#recordSearch').fill('ENG-OLD');
  assert.equal(await engineer.locator('#recordsTable .empty-state').isVisible(), true, 'search must not reveal previous-week rows');
  await engineer.setViewportSize({ width: 390, height: 844 });
  await engineer.reload({ waitUntil: 'networkidle' });
  await engineer.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });
  assert.equal(await engineer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'engineer mobile page overflows horizontally');
  await engineer.locator('#mobileMenu').click();
  await engineer.locator('[data-view="reports"]').click();
  await engineer.waitForTimeout(300);
  assert.equal(await engineer.locator('#sidebar').evaluate(el => el.classList.contains('open')), false, 'mobile navigation must close the sidebar');
  assert.equal(await engineer.locator('#engineerWeeklyReport').isVisible(), true);
  assert.equal(await engineer.locator('#engineerWeeklyReport .stat-card').count(), 4);
  assert.equal(await engineer.locator('#engineerWeeklyReport').evaluate(el => el.getBoundingClientRect().right <= innerWidth + 1), true, 'engineer report exceeds mobile viewport');
  if (screenshotDir) await engineer.screenshot({ path: join(screenshotDir, 'salima-engineer-mobile-report.png'), fullPage: true });
  await engineer.close();

  const emptyEngineer = await openScenario(browser, { role: 'engineer', size: 20, emptyWeek: true });
  await emptyEngineer.locator('[data-view="reports"]').click();
  await emptyEngineer.locator('#refreshEngineerWeeklyReport').click();
  assert.equal(await emptyEngineer.locator('#engineerReportEmpty').isVisible(), true, 'empty engineer week must show a clear message');
  assert.equal((await emptyEngineer.locator('#engineerReportEmpty').innerText()).trim(), 'لا يوجد إنتاج مسجل لهذا الأسبوع');
  assert.equal(await emptyEngineer.locator('#printableWeeklyReport').isVisible(), false, 'empty engineer report must not reveal management data');
  await emptyEngineer.close();

  const recordsOnlyEngineer = await openScenario(browser, { role: 'engineer', size: 20, recordsOnly: true });
  assert.equal(await recordsOnlyEngineer.locator('[data-view="production"]').isVisible(), false, 'production navigation should respect production.view override');
  await recordsOnlyEngineer.locator('[data-view="records"]').click();
  assert.equal(await recordsOnlyEngineer.locator('[data-edit-production]').count(), 2, 'records.update must remain independently usable');
  await recordsOnlyEngineer.locator('[data-edit-production]').first().click();
  assert.equal(await recordsOnlyEngineer.locator('#view-production').isVisible(), true, 'records.update must open the record editor without production.view');
  assert.equal(await recordsOnlyEngineer.locator('#cancelProductionEdit').isVisible(), true);
  await recordsOnlyEngineer.locator('#cancelProductionEdit').click();
  assert.equal(await recordsOnlyEngineer.locator('#view-records').isVisible(), true, 'cancel must return a records-only user to records');
  await recordsOnlyEngineer.close();

  await browser.close();
  console.log('Desktop/mobile records layout, engineer weekly report, role scope, and >1000 pagination checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
