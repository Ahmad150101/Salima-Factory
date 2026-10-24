import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261005_document_user_permissions.sql', import.meta.url), 'utf8');
const weeklyMigration = readFileSync(new URL('../supabase/migrations/20261005102908_engineer_current_week_records_and_weekly_report.sql', import.meta.url), 'utf8');
const nylonMigration = readFileSync(new URL('../supabase/migrations/20261024171859_server_calendar_and_detailed_nylon.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const publicConfig = readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');
const dailyExport = readFileSync(new URL('../supabase/functions/daily-export/index.ts', import.meta.url), 'utf8');
const appsScript = readFileSync(new URL('../backup/google-apps-script.gs', import.meta.url), 'utf8');
const testSeed = readFileSync(new URL('../backup/seed-test-data.sql', import.meta.url), 'utf8');
const testCleanup = readFileSync(new URL('../backup/cleanup-test-data.sql', import.meta.url), 'utf8');
const legacyPagesWorkflow = new URL('../.github/workflows/pages.yml', import.meta.url);

const pages = ['dashboard', 'production', 'shipments', 'products', 'reports', 'records', 'users', 'activity', 'system'];
const actions = ['view', 'create', 'update', 'delete', 'export', 'print'];
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

function extractJavaScriptFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing JavaScript function ${name}`);
  const openingBrace = source.indexOf('{', start);
  assert.notEqual(openingBrace, -1, `Missing opening brace for ${name}`);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`Missing closing brace for ${name}`);
}

function localDateParts(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

function policyStatements(sql, table, operation) {
  return [...sql.matchAll(/create\s+policy[\s\S]*?;/gi)]
    .map(match => match[0])
    .filter(statement => new RegExp(`on\\s+public\\.${table}\\s+for\\s+${operation}\\b`, 'i').test(statement));
}

assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(css, /\.permissions-dialog/);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML contains duplicate ids');
assert.match(html, /id="recordDateFilter"[^>]*type="date"|type="date"[^>]*id="recordDateFilter"/, 'records date filter is missing');
assert.match(html, /id="clearRecordDateFilter"/, 'records date clear button is missing');
assert.match(html, /id="recordsScopeNote"/, 'records scope note is missing');
assert.match(html, /id="engineerReportPeriodLabel"/, 'engineer weekly period label is missing');
assert.match(html, /id="reportsNavLabel"/, 'role-specific reports navigation label is missing');
assert.match(html, /id="refreshEngineerWeeklyReport"[^>]*>\s*عرض تقرير هذا الأسبوع\s*</, 'engineer weekly report button is missing');
assert.match(html, /id="engineerReportEmpty"[^>]*>\s*لا يوجد إنتاج مسجل لهذا الأسبوع\s*</, 'engineer empty-week message is missing');
assert.match(html, /class="records-scope"/, 'records scope wrapper is missing');
assert.match(html, /id="productionProductsEmpty"/, 'production form empty-products guidance is missing');
assert.match(html, /id="productName"[^>]*placeholder="اسم الصنف"|placeholder="اسم الصنف"[^>]*id="productName"/, 'product name placeholder must be generic');
assert.doesNotMatch(html, /id="unitWeightKg"[^>]*\bvalue\s*=\s*["']0\.2["']|\bvalue\s*=\s*["']0\.2["'][^>]*id="unitWeightKg"/, 'unit weight must not have a factory default');
for (const metric of ['pallets', 'production-weight', 'transparent-weight', 'transparent-quantity', 'printed-weight', 'printed-quantity']) {
  assert.match(html, new RegExp(`data-report-metric="${metric}"`), `engineer report metric is missing: ${metric}`);
}
assert.equal((html.match(/data-report-scope="engineer"/g) || []).length, 1, 'engineer must have one limited report section');
assert.ok((html.match(/data-report-scope="management"/g) || []).length >= 3, 'management report sections must be explicitly scoped');

for (const page of pages) {
  assert.match(app, new RegExp(`\\b${page}: \\[`), `PAGE_ACTIONS is missing ${page}`);
  assert.match(html, new RegExp(`data-view="${page}"`), `navigation is missing ${page}`);
  assert.match(html, new RegExp(`id="view-${page}"`), `view is missing ${page}`);
}

for (const action of actions) {
  assert.match(app, new RegExp(`${action}: '`, 'm'), `Arabic action label is missing ${action}`);
}

assert.match(app, /permission_key: `\$\{input\.dataset\.permissionPage\}\.\$\{input\.dataset\.permissionAction\}`/);
assert.match(app, /onConflict: 'user_id,permission_key'/);
assert.doesNotMatch(app, /\bpage_key\b|\baction_key\b/);
assert.match(app, /async\s+function\s+fetchAllRows\s*\(/, 'batched Supabase reader is missing');
assert.match(app, /\.range\s*\(/, 'Supabase range pagination is missing');
assert.match(app, /currentRole\s*===\s*['"]engineer['"]\s*\?\s*can\(['"]shipments['"]\)\s*:\s*can\(['"]shipments['"]\)\s*\|\|\s*can\(['"]reports['"]\)/, 'engineer reports.view must not implicitly load shipments');
assert.match(app, /reportsNavLabel['"]\)\)\s*\$\(['"]#reportsNavLabel['"]\)\.textContent\s*=\s*isEngineer\s*\?\s*['"]التقرير الأسبوعي['"]\s*:\s*['"]التقارير['"]/, 'reports navigation label must change only for engineer');
assert.match(app, /refreshEngineerWeeklyReport['"]\)\?\.addEventListener\(['"]click['"],\s*renderEngineerWeeklyReport\)/, 'engineer weekly report button is not wired');
assert.match(app, /engineerReportEmpty['"]\)\?\.classList\.toggle\(['"]hidden['"],\s*records\.length\s*>\s*0\)/, 'engineer empty-week message is not updated');
assert.match(css, /\.records-panel-head\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*stretch/s, 'desktop records header must be compact and stacked');
assert.match(css, /\.records-toolbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(260px,\s*1fr\)\s+max-content/s, 'desktop records filters must share one balanced row');
assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*?\.record-date-controls\s*\{[^}]*grid-template-columns:\s*1fr/s, 'mobile records controls must stack at full width');

assert.equal(existsSync(legacyPagesWorkflow), false, 'legacy GitHub Pages workflow must stay removed');
assert.doesNotMatch(app, /\bDEFAULT_PRODUCTS\b/, 'runtime must not contain default products');
assert.match(app, /const\s+seed\s*=\s*\{[\s\S]*?products:\s*\[\s*\]/, 'runtime product seed must be empty');
assert.doesNotMatch(app, /unitWeightKg\.value\s*=\s*0\.2\b/, 'product form reset must not restore a fixed unit weight');
assert.doesNotMatch(app, /يجب إبقاء صنف واحد على الأقل/, 'deleting the last unused product must not be blocked');
assert.match(app, /لا توجد أصناف مضافة بعد/, 'products page empty state is missing');
assert.match(app, /<option value="">لا توجد أصناف مضافة<\/option>/, 'production product selector empty state is missing');
assert.match(app, /saveProductionBtn\.disabled\s*=\s*!productionFormProduct\(\)/, 'production save button must remain disabled without a valid product');
assert.match(app, /db\.rpc\(['"]get_factory_calendar['"]\)/, 'factory calendar must be loaded from Supabase RPC');
assert.match(app, /if \(factoryCalendar\) return \{ \.\.\.factoryCalendar \}/, 'current week must prefer the server calendar');
assert.doesNotMatch(html, /id="printedNylonMode"|id="transparentNylonWeight"|<select id="wasteType"/, 'legacy nylon mode and fixed waste select must be removed');
for (const helper of ['transparentNylonTotalWeight', 'transparentNylonTotalQuantity', 'printedNylonTotalWeight', 'printedNylonTotalQuantity']) {
  assert.match(app, new RegExp(`function\\s+${helper}\\s*\\(`), `missing nylon total helper: ${helper}`);
}
for (const column of ['transparent_nylon_items', 'printed_nylon_items']) {
  assert.match(nylonMigration, new RegExp(`add column if not exists ${column} jsonb`, 'i'), `migration must add ${column}`);
  assert.match(schema, new RegExp(`${column} jsonb not null default`, 'i'), `schema must define ${column}`);
}
assert.match(nylonMigration, /create\s+or\s+replace\s+function\s+public\.get_factory_calendar/i);
assert.match(nylonMigration, /create\s+trigger\s+sync_nylon_legacy_fields/i, 'local migration must document the production trigger name');
assert.match(nylonMigration, /grant\s+execute\s+on\s+function\s+public\.get_factory_calendar\(\)\s+to\s+authenticated/i);
assert.doesNotMatch(nylonMigration, /delete\s+from\s+(?:public\.)?(?:profiles|user_permissions|production_records)/i, 'nylon migration must not delete production or user data');
assert.match(schema, /create table if not exists public\.products/i, 'schema must keep the products table structure');
assert.doesNotMatch(schema, /insert\s+into\s+public\.products\b/i, 'clean-install schema must not seed factory products');
for (const factoryName of ['محارم المنى', 'محارم المرام', 'محارم رانيا', 'محارم الهنا']) {
  for (const [name, source] of [['runtime', app], ['HTML', html], ['schema', schema]]) {
    assert.equal(source.includes(factoryName), false, `${name} still contains factory product data: ${factoryName}`);
  }
}

const productHelpers = new Function(`
  const state = { products: [{ id: 'product-1', name: 'Current definition', bagsPerPallet: 30, packsPerBag: 10, unitsPerPack: 5, unitWeightKg: 0.9 }] };
  const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  function getProduct(id) { return state.products.find(product => product.id === id); }
  ${extractJavaScriptFunction(app, 'isProductDefinition')}
  ${extractJavaScriptFunction(app, 'recordProduct')}
  ${extractJavaScriptFunction(app, 'calculateOutput')}
  ${extractJavaScriptFunction(app, 'recordOutput')}
  return { recordProduct, recordOutput, state };
`)();
const historicalRecord = {
  productId: 'product-1', pallets: 2, extraBags: 0,
  productSnapshot: { id: 'product-1', name: 'Historical snapshot', bagsPerPallet: 30, packsPerBag: 10, unitsPerPack: 5, unitWeightKg: 0.2 }
};
assert.equal(productHelpers.recordProduct(historicalRecord).name, 'Historical snapshot', 'record product must prefer its stored snapshot');
assert.equal(productHelpers.recordOutput(historicalRecord).weightKg, 600, 'historical output must use snapshot weight');
productHelpers.state.products[0].unitWeightKg = 1.25;
assert.equal(productHelpers.recordOutput(historicalRecord).weightKg, 600, 'changing the current product must not change historical output');
const recordProductSource = extractJavaScriptFunction(app, 'recordProduct');
assert.ok(recordProductSource.indexOf('productSnapshot') < recordProductSource.indexOf('getProduct'), 'recordProduct must check the snapshot before the current product');
assert.doesNotMatch(app, /getProduct\(r\.productId\)\s*\|\|\s*r\.productSnapshot/, 'historical record views must not prefer the current product');
assert.ok((app.match(/recordProduct\(r\)/g) || []).length >= 4, 'records, reports, dashboard, and exports must use recordProduct');

const weekFunctions = new Function(`${extractJavaScriptFunction(app, 'startOfWeek')}\n${extractJavaScriptFunction(app, 'endOfWeek')}\nreturn { startOfWeek, endOfWeek };`)();
const weekCases = [
  { input: new Date(2026, 9, 3, 12), start: [2026, 10, 3], end: [2026, 10, 9], label: 'Saturday' },
  { input: new Date(2026, 9, 4, 12), start: [2026, 10, 3], end: [2026, 10, 9], label: 'Sunday' },
  { input: new Date(2026, 9, 9, 12), start: [2026, 10, 3], end: [2026, 10, 9], label: 'Friday' },
  { input: new Date(2026, 0, 2, 12), start: [2025, 12, 27], end: [2026, 1, 2], label: 'year boundary' }
];
for (const { input, start, end, label } of weekCases) {
  assert.deepEqual(localDateParts(weekFunctions.startOfWeek(input)), start, `week must start on Saturday for ${label}`);
  assert.deepEqual(localDateParts(weekFunctions.endOfWeek(input)), end, `week must end on Friday for ${label}`);
}

const roleDefault = new Function(`return (${extractJavaScriptFunction(app, 'roleDefault')});`)();
assert.equal(roleDefault('engineer', 'reports', 'view'), true, 'engineer reports.view default is missing');
assert.equal(roleDefault('engineer', 'records', 'view'), true, 'engineer records.view default is missing');
assert.equal(roleDefault('engineer', 'records', 'update'), true, 'engineer records.update default is missing');
assert.equal(roleDefault('engineer', 'records', 'delete'), false, 'engineer records.delete must stay disabled');
assert.equal(roleDefault('engineer', 'reports', 'export'), false, 'engineer reports.export must stay disabled by default');
assert.equal(roleDefault('engineer', 'reports', 'print'), false, 'engineer reports.print must stay disabled by default');
for (const [page, action] of [['records', 'delete'], ['reports', 'print'], ['shipments', 'view']]) {
  assert.equal(roleDefault('owner', page, action), true, `owner must always have ${page}.${action}`);
}

for (const sql of [migration, schema]) {
  assert.match(sql, /primary key \(user_id, permission_key\)/);
  assert.match(sql, /when p\.role = 'owner' then true/);
  assert.match(sql, /alter table public\.user_permissions enable row level security/);
  assert.match(sql, /private\.has_permission\('production\.create'\)/);
  assert.match(sql, /private\.has_permission\('records\.delete'\)/);
  assert.doesNotMatch(sql, /\bpage_key\b|\baction_key\b/);
}

const permissionKeys = sql => [...new Set([...sql.matchAll(/'([a-z]+\.(?:view|create|update|delete|export|print))'/g)].map(match => match[1]))].sort();
assert.deepEqual(permissionKeys(migration), permissionKeys(schema), 'migration and clean-install schema permission keys differ');
for (const key of ['production.update', 'shipments.update', 'products.update', 'records.update']) {
  assert.ok(permissionKeys(migration).includes(key), `migration is missing ${key}`);
  assert.ok(permissionKeys(schema).includes(key), `schema is missing ${key}`);
}
for (const sql of [migration, schema, weeklyMigration]) {
  assert.doesNotMatch(sql, /'(?:production|shipments|products|records)\.edit'/, 'legacy edit permission key must not be documented');
}

assert.match(app, /function\s+canOpenView\s*\(/, 'granular record update view helper is missing');
assert.match(app, /can\(['"]production['"]\)\s*\|\|\s*can\(['"]records['"]\)/, 'record editing must accept records.view without production.view');
const engineerWeekFilter = extractJavaScriptFunction(app, 'engineerCurrentWeekRecords');
assert.match(engineerWeekFilter, /record\.createdBy\s*===\s*currentUser\?\.id/, 'engineer report must defensively keep only the current user records');
assert.match(engineerWeekFilter, /record\.date\s*>=\s*from/, 'engineer report must start on the current Saturday');
assert.match(engineerWeekFilter, /record\.date\s*<=\s*today/, 'engineer report must not include future or later-week rows');
assert.ok((app.match(/engineerCurrentWeekRecords\(\)/g) || []).length >= 3, 'engineer report and export must use the guarded week filter');
const presenceRefresh = extractJavaScriptFunction(app, 'updatePresence');
assert.match(presenceRefresh, /roleChanged\s*\|\|\s*permissionsChanged[\s\S]*?await\s+loadRemoteState\(\)/, 'role or permission changes must reload and scrub scoped data');
assert.match(presenceRefresh, /if\s*\(roleChanged\)[\s\S]*?state\.permissions\s*=\s*\[\][\s\S]*?scrubLoadedDataForAccessChange\(\)/, 'a live role change must fail closed before refreshing permissions');
assert.match(app, /function\s+scrubLoadedDataForAccessChange\s*\([\s\S]*?shipments:\s*\[\][\s\S]*?production:\s*\[\]/, 'access changes must clear cached production and shipment rows');

for (const [name, sql] of [['weekly migration', weeklyMigration], ['schema', schema]]) {
  assert.match(sql, /create\s+or\s+replace\s+function\s+private\.factory_today\s*\(\s*\)/i, `${name} is missing private.factory_today()`);
  assert.match(sql, /(?:timezone\s*\(\s*'Asia\/Hebron'\s*,\s*(?:now\(\)|current_timestamp)\s*\)|(?:now\(\)|current_timestamp)\s+at\s+time\s+zone\s+'Asia\/Hebron')\s*\)?\s*::\s*date/i, `${name} must calculate factory date in Asia/Hebron`);
  assert.match(sql, /create\s+or\s+replace\s+function\s+private\.current_week_start\s*\(\s*\)/i, `${name} is missing private.current_week_start()`);
  assert.match(sql, /'reports\.view'/, `${name} is missing the engineer reports.view default`);

  const productionSelect = policyStatements(sql, 'production_records', 'select').join('\n');
  const productionUpdate = policyStatements(sql, 'production_records', 'update').join('\n');
  const productionDelete = policyStatements(sql, 'production_records', 'delete').join('\n');
  assert.match(productionSelect, /current_week_start\s*\(\s*\)/i, `${name} production SELECT must use current week start`);
  assert.match(productionSelect, /factory_today\s*\(\s*\)/i, `${name} production SELECT must stop at factory today`);
  assert.match(productionSelect, /created_by\s*=\s*\(?\s*select\s+auth\.uid\s*\(\s*\)/i, `${name} production SELECT must restrict engineer rows to their creator`);
  assert.match(productionUpdate, /current_week_start\s*\(\s*\)/i, `${name} production UPDATE must use current week start`);
  assert.match(productionUpdate, /factory_today\s*\(\s*\)/i, `${name} production UPDATE must stop at factory today`);
  assert.match(productionUpdate, /created_by\s*=\s*\(?\s*select\s+auth\.uid\s*\(\s*\)/i, `${name} production UPDATE must restrict engineer rows to their creator`);
  assert.match(productionUpdate, /with\s+check/i, `${name} production UPDATE must include WITH CHECK`);
  assert.match(productionDelete, /current_app_role\s*\(\s*\)[\s\S]*?in\s*\(\s*'owner'\s*,\s*'admin'\s*\)/i, `${name} production DELETE must be restricted to owner/admin`);

  const shipmentPolicies = [...sql.matchAll(/create\s+policy[\s\S]*?on\s+public\.shipments[\s\S]*?;/gi)].map(match => match[0]).join('\n');
  assert.match(shipmentPolicies, /has_permission\s*\(\s*'shipments\.view'\s*\)/i, `${name} shipment SELECT must honor shipments.view`);
  assert.match(shipmentPolicies, /current_app_role\s*\(\s*\)[\s\S]*?in\s*\(\s*'owner'\s*,\s*'admin'\s*\)[\s\S]*?has_permission\s*\(\s*'reports\.view'\s*\)/i, `${name} reports.view shipment access must be guarded by owner/admin`);
}

assert.doesNotMatch(publicConfig, /service[_-]?role/i, 'A service-role key must never be present in public config');
for (const table of ['products', 'production_records', 'shipments', 'audit_logs', 'profiles', 'user_permissions']) {
  assert.match(dailyExport, new RegExp(`from\\(['"]${table}['"]\\)`), `daily-export is missing ${table}`);
}
assert.match(dailyExport, /generated_at:[\s\S]*?products,\s*production,\s*shipments,\s*activity,\s*profiles,\s*permissions/, 'daily-export response contract is incomplete');
assert.match(dailyExport, /profiles['"]\)\.select\(['"]id,username,full_name,role,is_active,created_at['"]\)/, 'profiles export must be restricted to safe columns');
assert.match(dailyExport, /user_permissions['"]\)\.select\(['"]user_id,permission_key,allowed,updated_by,updated_at['"]\)/, 'permissions export is incomplete');
assert.doesNotMatch(dailyExport, /select\([^\n]*(?:password|encrypted_password|raw_user_meta_data)/i, 'daily-export must not select auth secrets');
assert.match(dailyExport, /for \(let from = 0; ; from \+= pageSize\)/, 'daily-export must paginate every collection');
assert.ok((dailyExport.match(/fetchAllRows\(/g) || []).length >= 7, 'all six exported collections must use the paginated reader');
assert.ok((dailyExport.match(/\.range\(from, to\)/g) || []).length >= 6, 'all exported collections must use explicit ranges');
assert.match(dailyExport, /body\.token !== expectedToken/, 'daily-export must preserve the token-in-POST-body contract');
assert.match(dailyExport, /DAILY_SYNC_TOKEN/, 'daily-export must preserve DAILY_SYNC_TOKEN');

for (const tab of ['لوحة التحكم', 'الملخص اليومي', 'الإنتاج', 'الرولات المستخدمة', 'الشحنات', 'المنتجات', 'سجل النشاط', 'المستخدمون', 'الصلاحيات', 'Production Backup']) {
  assert.ok(appsScript.includes(tab), `Google Apps Script is missing tab ${tab}`);
}
assert.match(appsScript, /writeTableSheet\(spreadsheet, SHEETS\.productionBackup, productionHeaders, productionValues/, 'Production Backup must receive the same readable production rows');
assert.match(appsScript, /createFilter\(\)/, 'table sheets must include filters');
assert.match(appsScript, /autoResizeColumns\(/, 'table sheets must auto-resize before important width overrides');
assert.doesNotMatch(appsScript, /الرولات JSON/, 'production sheets must not expose raw rolls JSON');
for (const header of ['شفاف - التفاصيل', 'شفاف - الوزن', 'شفاف - العدد', 'مطبوع - التفاصيل', 'مطبوع - الوزن', 'مطبوع - العدد', 'وصف التالف', 'وزن التالف']) {
  assert.ok(appsScript.includes(header), `Google Apps Script is missing ${header}`);
}
for (const property of ['DAILY_EXPORT_URL', 'DAILY_SYNC_TOKEN', 'SUPABASE_PUBLISHABLE_KEY', 'LAST_SYNC_AT', 'XLSX_FILE_ID', 'BACKUP_FOLDER_ID']) {
  assert.ok(appsScript.includes(property), `Google Apps Script is missing Script Property ${property}`);
}
assert.match(appsScript, /Invalid daily-export response/, 'Apps Script must validate the daily-export response body');
assert.match(appsScript, /productSnapshot\(record\)/, 'Apps Script production export must use the stored product snapshot');
assert.match(appsScript, /upload\/drive\/v3\/files\/\$\{encodeURIComponent\(existingId\)\}/, 'Excel must update the fixed XLSX_FILE_ID');
assert.ok(appsScript.indexOf("setProperty('LAST_SYNC_AT'") > appsScript.indexOf('createOrUpdateExcelBackup()'), 'LAST_SYNC_AT must only be set after Excel succeeds');
assert.ok(appsScript.indexOf("setProperty('XLSX_FILE_ID'") > appsScript.indexOf('createOrUpdateExcelBackup()'), 'XLSX_FILE_ID must only be set after Excel succeeds');
assert.match(appsScript, /getDailyTriggerStatus/, 'Apps Script must expose daily trigger verification');
assert.match(appsScript, /everyDays\(1\)[\s\S]*?inTimezone\(TIMEZONE\)/, 'daily trigger must use the declared Asia/Hebron timezone');
assert.doesNotMatch(appsScript, /setTrashed\s*\(/, 'Excel backups must not delete earlier files');

const backupHelpers = new Function(`
  ${extractJavaScriptFunction(appsScript, 'round2')}
  ${extractJavaScriptFunction(appsScript, 'formatPlainNumber')}
  ${extractJavaScriptFunction(appsScript, 'readableRolls')}
  ${extractJavaScriptFunction(appsScript, 'readableValue')}
  ${extractJavaScriptFunction(appsScript, 'validatePayload')}
  ${extractJavaScriptFunction(appsScript, 'normalizeNylonItems')}
  ${extractJavaScriptFunction(appsScript, 'nylonTotals')}
  ${extractJavaScriptFunction(appsScript, 'productSnapshot')}
  ${extractJavaScriptFunction(appsScript, 'outputTotals')}
  ${extractJavaScriptFunction(appsScript, 'buildProductionRows')}
  ${extractJavaScriptFunction(appsScript, 'buildDailySummaryRows')}
  return { validatePayload, buildProductionRows, buildDailySummaryRows };
`)();
const emptyBackupPayload = { generated_at: '2026-10-24T00:00:00Z', products: [], production: [], shipments: [], activity: [], profiles: [], permissions: [] };
assert.doesNotThrow(() => backupHelpers.validatePayload(emptyBackupPayload), 'empty arrays are a valid daily-export response');
assert.throws(() => backupHelpers.validatePayload({ ...emptyBackupPayload, permissions: undefined }), /permissions must be an array/, 'missing arrays must be rejected');
assert.deepEqual(backupHelpers.buildDailySummaryRows([]), [], 'empty production must yield an empty daily summary');

const profileNames = new Map([['owner-1', 'سليمة الإدارة']]);
const backupRows = backupHelpers.buildProductionRows([{
  id: 'record-1', production_date: '2026-10-24', shift: 'صباحي', pallets: 2, extra_bags: 1,
  product_snapshot: { name: 'منتج تاريخي', bagsPerPallet: 10, packsPerBag: 2, unitsPerPack: 5, unitWeightKg: 0.5 },
  transparent_nylon_items: [{ name: 'شفاف كبير', weight_kg: 50, quantity: 5 }, { name: 'شفاف صغير', weight_kg: 30, quantity: 6 }],
  printed_nylon_items: [{ name: 'مطبوع أ', weight_kg: 12.5, quantity: 2 }, { name: 'مطبوع ب', weight_kg: 7.5, quantity: 3 }],
  waste_type: 'تالف أثناء الضبط', waste_weight: 1.75, created_by: 'owner-1', notes: null,
}], profileNames);
assert.equal(backupRows[0].product, 'منتج تاريخي', 'production backup must prefer product_snapshot');
assert.equal(backupRows[0].outputWeight, 105, 'production weight must be calculated from the historical snapshot');
assert.equal(backupRows[0].transparentDetails, 'شفاف كبير: 50 كغم × 5 | شفاف صغير: 30 كغم × 6');
assert.equal(backupRows[0].transparentWeight, 80);
assert.equal(backupRows[0].transparentQuantity, 11);
assert.equal(backupRows[0].printedWeight, 20);
assert.equal(backupRows[0].printedQuantity, 5);
assert.equal(backupRows[0].wasteDescription, 'تالف أثناء الضبط');
assert.equal(backupRows[0].wasteWeight, 1.75);
assert.equal(backupRows[0].createdBy, 'سليمة الإدارة');
assert.equal(backupRows[0].notes, '', 'missing optional values must remain safe');
const summaryRows = backupHelpers.buildDailySummaryRows(backupRows);
assert.deepEqual(summaryRows[0], ['2026-10-24', 1, 2, 105, 80, 11, 20, 5, 1.75]);

assert.match(testSeed, /current_date\s*-\s*74[\s\S]*?generate_series\(1,\s*6\)/, 'TEST seed must cover 75 days with six production records per day');
assert.match(testSeed, /current_date\s*-\s*72[\s\S]*?interval '4 days'/, 'TEST shipments must be distributed every four days');
assert.ok((testSeed.match(/'TEST — /g) || []).length >= 5, 'TEST seed must include five clearly marked products');
assert.match(testSeed, /TEST شفاف كبير/);
assert.match(testSeed, /TEST مطبوع رئيسي/);
assert.match(testSeed, /TEST تالف ضبط ماكينة/);
assert.doesNotMatch(testSeed, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?public\.(?:profiles|user_permissions)/i, 'TEST seed must not modify real users or permissions');
assert.doesNotMatch(testSeed, /\b(?:create|alter|drop|truncate)\b/i, 'TEST seed must remain DML-only');
assert.match(testCleanup, /delete from public\.production_records where notes like '\[TEST\] PROD-%'/);
assert.match(testCleanup, /delete from public\.shipments where reference like 'TEST-SHIP-%'/);
assert.match(testCleanup, /delete from public\.products where name like 'TEST — %'/);

console.log('Static calendar, nylon, backup, permission, RLS, pagination, HTML, and responsive checks passed.');
