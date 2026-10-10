const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const schema = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8');
const storage = readFileSync('supabase/migrations/0002_private_video_storage.sql', 'utf8');
const profilePrivacy = readFileSync('supabase/migrations/0005_restrict_private_profile_reads.sql', 'utf8');

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


test('private profiles are readable only by their owner', () => {
  assert.match(schema, /using \(id = \(select auth\.uid\(\)\) or is_private = false\);/);
  assert.match(profilePrivacy, /for select to anon, authenticated[\s\S]*?using \(id = \(select auth\.uid\(\)\) or is_private = false\);/);
  assert.doesNotMatch(profilePrivacy, /using \(true\)/i);
});


test('blocking a user removes existing follows in both directions', () => {
  const blockMigration = readFileSync('supabase/migrations/0006_remove_follows_on_block.sql', 'utf8');
  assert.match(blockMigration, /after insert on public\.user_blocks/i);
  assert.match(blockMigration, /delete from public\.follows[\s\S]*?follower_id = new\.blocker_id and followed_id = new\.blocked_id[\s\S]*?or \(follower_id = new\.blocked_id and followed_id = new\.blocker_id\)/i);
  assert.match(blockMigration, /revoke all on function public\.remove_follows_on_block\(\) from public, anon, authenticated/i);
});


test('private profiles cannot be followed until follow requests are implemented', () => {
  const followPrivacy = readFileSync('supabase/migrations/0007_restrict_follows_to_public_profiles.sql', 'utf8');
  assert.match(followPrivacy, /private\.is_profile_public\(followed_id\)/);
  assert.match(followPrivacy, /and not private\.is_blocked_pair\(follower_id, followed_id\)/);
  assert.match(followPrivacy, /p\.is_private = false/);
});

test('video storage bucket is private and scoped to the authenticated owner', () => {
  assert.match(storage, /'video-originals',[\s\S]*?false,[\s\S]*?52428800/);
  assert.match(storage, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(storage, /create policy[^;]+for select to anon/i);
});

const auth = readFileSync('auth.js', 'utf8');
const config = readFileSync('supabase-config.js', 'utf8');

test('Supabase client and auth module load before account interaction', () => {
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/);
  assert.match(html, /src="\.\/supabase-config\.js"/);
  assert.match(html, /src="\.\/auth\.js" defer/);
  assert.match(config, /https:\/\/eesyjavwmuopobmgcucb\.supabase\.co/);
  assert.doesNotMatch(config, /service_role|secret/i);
});

test('account UI uses Supabase Auth and requires an 18+ acknowledgement for signup', () => {
  assert.match(auth, /auth\.signUp\(/);
  assert.match(auth, /auth\.signInWithPassword\(/);
  assert.match(auth, /auth\.resetPasswordForEmail\(/);
  assert.match(auth, /auth\.signOut\(/);
  assert.match(auth, /document\.getElementById\('auth-age'\)\.checked/);
  assert.match(auth, /age_confirmed:\s*true/);
  assert.match(auth, /aria-live="polite"/);
});

test('authenticated profile editing is scoped to the current user', () => {
  assert.match(auth, /from\('profiles'\)\.select\('display_name,username,bio,is_private'\)/);
  assert.match(auth, /from\('profiles'\)\.update\(values\)\.eq\('id', user\.id\)/);
  assert.match(auth, /id="profile-private" type="checkbox"/);
  assert.match(auth, /maxlength="500"/);
});
