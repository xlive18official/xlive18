const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const schema = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8');
const storage = readFileSync('supabase/migrations/0002_private_video_storage.sql', 'utf8');

test('document is Arabic RTL and links the local app assets', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /src="\.\/app\.js" defer/);
});

test('all navigation destinations in the HTML have a defined view', () => {
  const destinations = new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]));
  const viewBlock = app.match(/const views = \{([\s\S]*?)\n  \};/);
  assert.ok(viewBlock, 'app.js must define the view map');
  const definedViews = new Set([...viewBlock[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*\{/gm)].map(match => match[1]));
  for (const destination of destinations) {
    assert.ok(definedViews.has(destination), 'missing view: ' + destination);
  }
});

test('search is handled without injecting raw user input as HTML', () => {
  assert.match(app, /searchForm\.addEventListener\('submit'/);
  assert.match(app, /escapeHtml\(extra \|\| ''\)/);
  assert.match(app, /replace\(\/\[&<>"'\]\/g/);
});

test('responsive layout and reduced-motion preferences exist', () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('all application tables have row-level security enabled', () => {
  for (const table of ['profiles','user_blocks','follows','videos','rooms','room_members','reports','notifications','purchases']) {
    assert.match(schema, new RegExp('alter table public\\.' + table + ' enable row level security;'));
  }
});

test('video publication and room state are restricted by database policies', () => {
  assert.match(schema, /status = 'approved' and is_paid = false and visibility = 'public'/);
  assert.match(schema, /status = 'pending' and reviewed_by is null and reviewed_at is null/);
  assert.match(schema, /provider_room_ref is null/);
  assert.match(schema, /grant select on public\.purchases to authenticated/);
  assert.doesNotMatch(schema, /create policy "purchases_insert/);
});

test('video storage bucket is private and scoped to the authenticated owner', () => {
  assert.match(storage, /'video-originals',[\s\S]*?false,[\s\S]*?52428800/);
  assert.match(storage, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(storage, /create policy[^;]+for select to anon/i);
});
