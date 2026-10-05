import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261005_document_user_permissions.sql', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const publicConfig = readFileSync(new URL('../public/config.js', import.meta.url), 'utf8');

const pages = ['dashboard', 'production', 'shipments', 'products', 'reports', 'records', 'users', 'activity', 'system'];
const actions = ['view', 'create', 'update', 'delete', 'export', 'print'];
const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);

assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 620px\)/);
assert.match(css, /\.permissions-dialog/);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML contains duplicate ids');

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

for (const sql of [migration, schema]) {
  assert.match(sql, /primary key \(user_id, permission_key\)/);
  assert.match(sql, /when p\.role = 'owner' then true/);
  assert.match(sql, /alter table public\.user_permissions enable row level security/);
  assert.match(sql, /private\.has_permission\('production\.create'\)/);
  assert.match(sql, /private\.has_permission\('records\.delete'\)/);
  assert.doesNotMatch(sql, /\bpage_key\b|\baction_key\b/);
}

const permissionKeys = sql => [...new Set([...sql.matchAll(/'([a-z]+\.(?:view|create|update|delete|export|print))'/g)].map(match => match[1]))].sort();
assert.equal(permissionKeys(migration).length, 25, 'migration should document all 25 supported permission keys');
assert.deepEqual(permissionKeys(migration), permissionKeys(schema), 'migration and clean-install schema permission keys differ');

assert.doesNotMatch(publicConfig, /service[_-]?role/i, 'A service-role key must never be present in public config');

console.log('Static permission, RLS, HTML, and responsive checks passed.');
