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


test('private profiles require requests and cannot be followed directly', () => {
  const followPrivacy = readFileSync('supabase/migrations/0007_restrict_follows_to_public_profiles.sql', 'utf8');
  assert.match(followPrivacy, /private\.is_profile_public\(followed_id\)/);
  assert.match(followPrivacy, /and not private\.is_blocked_pair\(follower_id, followed_id\)/);
  assert.match(followPrivacy, /p\.is_private = false/);
});


test('private profile follow requests are participant-scoped and accepted by the target only', () => {
  const requests = readFileSync('supabase/migrations/0008_private_profile_follow_requests.sql', 'utf8');
  assert.match(requests, /create table if not exists public\.follow_requests/i);
  assert.match(requests, /requester_id = \(select auth\.uid\(\)\) or target_id = \(select auth\.uid\(\)\)/i);
  assert.match(requests, /new\.target_id <> auth\.uid\(\)/i);
  assert.match(requests, /insert into public\.follows \(follower_id, followed_id\)/i);
  assert.match(requests, /delete from public\.follow_requests/i);
});


test('account search and social controls call Supabase actions', () => {
  assert.match(app, /window\.XLiveAuth\?\.renderSearch\(extra\)/);
  assert.match(auth, /rpc\('search_profiles'/);
  assert.match(auth, /from\('follow_requests'\)\.insert/);
  assert.match(auth, /from\('follows'\)\.insert/);
  assert.match(auth, /from\('user_blocks'\)\.insert/);
  assert.match(auth, /data-social-action="accept"/);
});
test('account discovery RPC exposes minimal fields and is hardened in the latest migration', () => {
  const discovery = readFileSync('supabase/migrations/0009_profile_discovery_and_follow_request_hardening.sql', 'utf8');
  const hardening = readFileSync('supabase/migrations/0013_tighten_profile_search_and_follow_request_transitions.sql', 'utf8');
  assert.match(discovery, /returns table \(id uuid, username text, display_name text, is_private boolean\)/i);
  assert.match(hardening, /revoke all on function public\.search_profiles\(text\) from public, anon/i);
  assert.match(hardening, /grant execute on function public\.search_profiles\(text\) to authenticated/i);
  assert.match(hardening, /auth\.uid\(\) is not null/i);
  assert.match(hardening, /left\(lower\(p\.username\), char_length\(trim\(search_term\)\)\)/i);
  assert.match(hardening, /old\.status <> 'pending'/i);
  assert.match(hardening, /new\.target_id <> auth\.uid\(\)/i);
});

test('RLS policies use initplan-friendly auth checks and avoid overlapping admin ALL policies', () => {
  const rls = readFileSync('supabase/migrations/0014_optimize_rls_policy_evaluation.sql', 'utf8');
  assert.match(rls, /\(select auth\.jwt\(\)\)/i);
  assert.match(rls, /drop policy if exists "videos_admin_all"/i);
  assert.match(rls, /drop policy if exists "rooms_admin_all"/i);
  assert.match(rls, /create policy "videos_admin_delete"/i);
  assert.match(rls, /create policy "rooms_admin_delete"/i);
});


test('direct messages enforce participant access, follow connection, and read-only receipt updates', () => {
  const messaging = readFileSync('supabase/migrations/0015_direct_messages_and_social_notifications.sql', 'utf8');
  assert.match(messaging, /alter table public\.messages enable row level security/i);
  assert.match(messaging, /sender_id = \(select auth\.uid\(\)\)/i);
  assert.match(messaging, /not private\.is_blocked_pair\(sender_id, recipient_id\)/i);
  assert.match(messaging, /exists \([\s\S]*?from public\.follows f/i);
  assert.match(messaging, /grant update \(read_at\) on public\.messages to authenticated/i);
  assert.match(messaging, /after insert on public\.messages/i);
  assert.match(messaging, /after insert or update of status on public\.follow_requests/i);
});
test('messages and notifications are connected to real application views', () => {
  assert.match(app, /window\.XLiveAuth\?\.renderMessages\(\)/);
  assert.match(app, /window\.XLiveAuth\?\.renderNotifications\(\)/);
  assert.match(auth, /from\('messages'\)\.insert/);
  assert.match(auth, /from\('notifications'\)\.select/);
  assert.match(auth, /mark-notification-read/);
  assert.match(css, /\.messages-layout/);
  assert.match(css, /\.notification-item/);
});


test('video upload stays private until moderation and approved free videos can be streamed', () => {
  const delivery = readFileSync('supabase/migrations/0016_approved_video_delivery_and_review_notifications.sql', 'utf8');
  assert.match(auth, /storage\.from\('video-originals'\)\.upload/);
  assert.match(auth, /status:'pending',visibility:'public',is_paid:false/);
  assert.match(delivery, /v\.status = 'approved'/i);
  assert.match(delivery, /v\.is_paid = false/i);
  assert.match(delivery, /v\.visibility = 'public'/i);
  assert.match(delivery, /after update of status on public\.videos/i);
  assert.match(app, /window\.XLiveAuth\?\.renderClips\(\)/);
});
test('messages, follow requests, and notifications have RLS enabled in their migrations', () => {
  const requests = readFileSync('supabase/migrations/0008_private_profile_follow_requests.sql', 'utf8');
  const messaging = readFileSync('supabase/migrations/0015_direct_messages_and_social_notifications.sql', 'utf8');
  assert.match(requests, /alter table public\.follow_requests enable row level security/i);
  assert.match(messaging, /alter table public\.messages enable row level security/i);
  assert.match(schema, /alter table public\.notifications enable row level security;/i);
  assert.match(messaging, /alter table public\.notifications drop constraint if exists notifications_kind_check/i);
});


test('room requests can be cancelled by hosts without enabling client-side live transitions', () => {
  const rooms = readFileSync('supabase/migrations/0017_room_cancellation_and_video_review_validation.sql', 'utf8');
  assert.match(auth, /from\('rooms'\)\.insert\(room\)/);
  assert.match(auth, /status:'pending',provider_room_ref:null/);
  assert.match(rooms, /status in \('pending','cancelled'\)/i);
  assert.match(rooms, /Video review must include reviewer and timestamp/i);
  assert.match(auth, /data-social-action="cancel-room"/);
});
test('report submission and admin review are wired to RLS-protected reports', () => {
  assert.match(auth, /from\('reports'\)\.insert/);
  assert.match(auth, /from\('reports'\)\.update/);
  assert.match(auth, /data-social-action="resolve-report"/);
  assert.match(auth, /data-social-action="report-video"/);
  assert.match(auth, /data-social-action="report-profile"/);
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
