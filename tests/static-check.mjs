import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261005_document_user_permissions.sql', import.meta.url), 'utf8');
const weeklyMigration = readFileSync(new URL('../supabase/migrations/20261005102908_engineer_current_week_records_and_weekly_report.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const publicConfig = readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');

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
for (const metric of ['pallets', 'production-weight', 'printed-weight', 'printed-rolls']) {
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

console.log('Static permission, Saturday-Friday week, RLS, pagination, HTML, and responsive checks passed.');
