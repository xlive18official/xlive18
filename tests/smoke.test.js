const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const html = readFileSync('index.html', 'utf8');
const app = readFileSync('app.js', 'utf8');
const css = readFileSync('styles.css', 'utf8');
const admin = readFileSync('admin.js', 'utf8');
const schema = readFileSync('supabase/migrations/0001_initial_schema.sql', 'utf8');
const storage = readFileSync('supabase/migrations/0002_private_video_storage.sql', 'utf8');
const profilePrivacy = readFileSync('supabase/migrations/0005_restrict_private_profile_reads.sql', 'utf8');


test('Cloudflare build includes every browser script referenced by index.html', () => {
  const build = readFileSync('scripts/prepare-cloudflare.mjs', 'utf8');
  for (const script of ['app.js', 'auth.js', 'admin.js', 'account-controls.js', 'site-editor.js', 'supabase-config.js']) {
    assert.ok(new RegExp('src="./' + script.replace('.', '\\.') + '(?:\\?[^"]*)?"').test(html), 'index.html must load ' + script);
    assert.ok(build.includes('"' + script + '"'), 'Cloudflare build must copy ' + script);
  }
});

test('document is Arabic RTL and links the local app assets', () => {
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.match(html, /href="\.\/styles\.css(?:\?[^"]*)?"/);
  assert.match(html, /src="\.\/app\.js(?:\?[^"]*)?" defer/);
});

test('all navigation destinations in the HTML have a defined view', () => {
  const destinations = new Set([...html.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]));
  const viewBlock = app.match(/const views = \{([\s\S]*?)\n  \};/);
  assert.ok(viewBlock, 'app.js must define the view map');
  const definedViews = new Set([...viewBlock[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9_]*):\s*\{/gm)].map(match => match[1]));
  if (html.includes('admin.js')) definedViews.add('admin');
  for (const destination of destinations) {
    assert.ok(definedViews.has(destination), 'missing view: ' + destination);
  }
});

test('search is handled without injecting raw user input as HTML', () => {
  assert.match(app, /searchForm\.addEventListener\('submit'/);
  assert.match(app, /render\('search', query\)/);
  assert.match(auth, /escapeHtml\(/);
});

test('admin destructive actions use in-site dialogs rather than browser prompts', () => {
  assert.match(admin, /function siteDialog\(/);
  assert.match(admin, /admin-dialog-backdrop/);
  assert.doesNotMatch(admin, /\\bconfirm\(/);
  assert.doesNotMatch(admin, /\\bprompt\(/);
  assert.match(css, /\.admin-dialog-backdrop/);
  assert.match(admin, /data-private-action="close"/);
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


test('private profiles are visible only to the owner and approved followers', () => {
  const profilePrivacy = readFileSync('supabase/migrations/0005_restrict_private_profile_reads.sql', 'utf8');
  const followerPrivacy = readFileSync('supabase/migrations/0021_allow_approved_followers_to_view_private_profiles.sql', 'utf8');
  assert.match(schema, /using \(id = \(select auth\.uid\(\)\) or is_private = false\);/);
  assert.match(profilePrivacy, /for select to anon, authenticated[\s\S]*?using \(id = \(select auth\.uid\(\)\) or is_private = false\);/);
  assert.match(followerPrivacy, /for select to anon[\s\S]*?using \(is_private = false\)/i);
  assert.match(followerPrivacy, /f\.follower_id = \(select auth\.uid\(\)\)/i);
  assert.match(followerPrivacy, /not private\.is_blocked_pair\(\(select auth\.uid\(\)\), profiles\.id\)/i);
  assert.doesNotMatch(followerPrivacy, /using \(true\)/i);
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


test('account search requires authentication and a longer prefix', () => {
  const search = readFileSync('supabase/migrations/0018_require_longer_authenticated_profile_search.sql', 'utf8');
  assert.match(search, /auth\.uid\(\) is not null/i);
  assert.match(search, /between 3 and 64/i);
  assert.match(search, /limit 20/i);
  assert.match(auth, /اكتب ثلاثة أحرف على الأقل/);
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
  assert.match(auth, /status:'pending'/);
  assert.doesNotMatch(auth, /provider_room_ref:null/);
  assert.match(rooms, /status in \('pending','cancelled'\)/i);
  assert.match(rooms, /Video review must include reviewer and timestamp/i);
  assert.match(auth, /data-social-action="cancel-room"/);
});
test('report submission and admin review are wired to RLS-protected reports', () => {
  assert.match(auth, /from\('reports'\)\.insert/);
  assert.match(auth, /from\('reports'\)\.update/);
  assert.match(auth, /data-social-action="resolve-report"/);
  assert.match(auth, /action === 'report-video'[\s\S]*?supabase\.from\('reports'\)\.insert/);
  assert.match(auth, /data-social-action="report-profile"/);
  assert.match(auth, /data-social-action="report-message"/);
});


test('client table grants are least-privilege and do not expose server-only columns', () => {
  const grants = readFileSync('supabase/migrations/0019_tighten_table_and_storage_grants.sql', 'utf8');
  const inserts = readFileSync('supabase/migrations/0020_restrict_client_insert_columns.sql', 'utf8');
  assert.match(grants, /revoke all privileges on table public\.profiles[\s\S]*?from anon, authenticated/i);
  assert.match(grants, /grant update \(read_at\) on public\.messages to authenticated/i);
  assert.match(inserts, /grant insert \(owner_id, title, description, storage_path, status, visibility, is_paid\) on public\.videos/i);
  assert.match(inserts, /grant insert \(reporter_id, target_type, target_id, reason, details, status\) on public\.reports/i);
  assert.match(inserts, /grant insert \(sender_id, recipient_id, body\) on public\.messages/i);
  assert.match(inserts, /grant insert \(requester_id, target_id, status\) on public\.follow_requests/i);
});


test('admins can remove previously approved videos and owners are notified', () => {
  const removal = readFileSync('supabase/migrations/0022_support_removal_of_approved_videos.sql', 'utf8');
  assert.match(auth, /action === 'remove-video'[\s\S]*?status = action === 'approve-video' \? 'approved' : action === 'remove-video' \? 'removed'/);
  assert.match(auth, /action === 'remove-video' \? 'removed'/);
  assert.match(removal, /new\.status in \('approved','rejected','removed'\)/i);
  assert.match(removal, /when new\.status = 'removed' then 'تمت إزالة الفيديو'/i);
});


test('saved videos are private to the owner and only approved public videos can be saved', () => {
  const saved = readFileSync('supabase/migrations/0023_saved_video_bookmarks.sql', 'utf8');
  assert.match(saved, /alter table public\.saved_videos enable row level security/i);
  assert.match(saved, /user_id = \(select auth\.uid\(\)\)/i);
  assert.match(saved, /v\.status = 'approved'/i);
  assert.match(saved, /v\.is_paid = false/i);
  assert.match(saved, /v\.visibility = 'public'/i);
  assert.match(auth, /from\('saved_videos'\)\.insert/);
  assert.match(auth, /renderSaved/);
});


test('homepage loads only approved free public videos from Supabase', () => {
  assert.match(app, /id="home-feed"/);
  assert.match(app, /window\.XLiveAuth\?\.renderHomeFeed\(\)/);
  assert.match(auth, /from\('videos'\)\.select\('id,title,description,storage_path,created_at',\s*\{count:\s*'exact'\}\)\.eq\('status','approved'\)\.eq\('is_paid',false\)\.eq\('visibility','public'\)/);
  assert.match(auth, /async function renderHomeFeed\(page = homeFeedPage\)/);
});


test('saved video foreign key has an index for deletion cascades', () => {
  const savedIndex = readFileSync('supabase/migrations/0024_index_saved_video_foreign_key.sql', 'utf8');
  assert.match(savedIndex, /create index if not exists saved_videos_video_id_idx on public\.saved_videos \(video_id\)/i);
});

test('video storage bucket is private and scoped to the authenticated owner', () => {
  assert.match(storage, /'video-originals',[\s\S]*?false,[\s\S]*?52428800/);
  assert.match(storage, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
  assert.doesNotMatch(storage, /create policy[^;]+for select to anon/i);
});

const auth = readFileSync('auth.js', 'utf8');
const config = readFileSync('supabase-config.js', 'utf8');

test('admin private media access is restricted, audited, and deletable only through guarded RPCs', () => {
  const migration = readFileSync('supabase/migrations/0029_admin_private_content_access.sql', 'utf8');
  assert.match(admin, /rpc\('admin_private_content_list'\)/);
  assert.match(admin, /rpc\('admin_log_private_content_access'/);
  assert.match(admin, /rpc\('admin_delete_private_content'/);
  assert.match(admin, /data-private-action="view"/);
  assert.match(admin, /data-private-action="delete"/);
  assert.match(migration, /lower\(coalesce\(auth\.jwt\(\) ->> 'email', ''\)\) = 'xlive18\.official@gmail\.com'/i);
  assert.match(migration, /create table if not exists public\.admin_private_content_audit/i);
  assert.match(migration, /where v\.visibility='private'/i);
  assert.match(migration, /where ph\.visibility='private'/i);
  assert.match(migration, /revoke all on function public\.admin_delete_private_content\(text,uuid\) from public, anon/i);
  assert.match(migration, /create policy "Manager can view private photos"/i);
  assert.match(migration, /create policy "Manager can view private videos"/i);
});
 
test('Supabase client and auth module load before account interaction', () => {
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/);
  assert.match(html, /src="\.\/supabase-config\.js(?:\?[^"]*)?"/);
  assert.match(html, /src="\.\/auth\.js(?:\?[^"]*)?" defer/);
  assert.match(config, /https:\/\/eesyjavwmuopobmgcucb\.supabase\.co/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /service_role\s*[:=]\s*['"]|sb_secret_/i);
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


test('password recovery supports updating the password after a recovery link', () => {
  assert.match(auth, /PASSWORD_RECOVERY/);
  assert.match(auth, /id="password-update-form"/);
  assert.match(auth, /auth\.updateUser\(\{password\}\)/);
  assert.match(auth, /كلمتا المرور غير متطابقتين/);
});

test('authenticated profile editing is scoped to the current user', () => {
  assert.match(auth, /from\('profiles'\)\.select\('display_name,username,bio,is_private'\)/);
  assert.match(auth, /from\('profiles'\)\.update\(values\)\.eq\('id', user\.id\)/);
  assert.match(auth, /id="profile-private" type="checkbox"/);
  assert.match(auth, /maxlength="500"/);
});


test('rooms view renders a single loading state before async room data replaces it', () => {
  assert.match(app, /if \(view === 'rooms'\) \{[\s\S]*?جارٍ تحميل الغرف[\s\S]*?renderRooms\(\);[\s\S]*?return;/);
  assert.doesNotMatch(app, /if \(view === 'rooms'\) window\.XLiveAuth\?\.renderRooms\(\);/);
  assert.match(auth, /async function renderRooms\(\)/);
  assert.match(auth, /root\.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 \/ ROOMS/);
});

test('saved view has a stable loading state before async saved videos render', () => {
  assert.match(app, /if \(view === 'saved'\) \{[\s\S]*?جارٍ تحميل المحفوظات[\s\S]*?renderSaved\(\);[\s\S]*?return;/);
  assert.doesNotMatch(app, /if \(view === 'saved'\) window\.XLiveAuth\?\.renderSaved\(\);/);
  assert.match(auth, /async function renderSaved\(\)/);
});

test('homepage has no stale content before app initialization and cache-busts assets', () => {
  assert.doesNotMatch(html, /استكشف المقاطع/);
  assert.doesNotMatch(html, /كل ما يهمك، في مكان واحد/);
  assert.doesNotMatch(html, /class="feature-grid"/);
  assert.match(html, /جارٍ تجهيز XLIVE 18/);
  assert.ok(html.includes('styles.css?v=20261012-45'));
  assert.ok(html.includes('app.js?v=20261012-45'));
});


test('auth session callbacks cannot replace homepage with the profile screen', () => {
  assert.match(auth, /async function renderProfile\(\)[\s\S]*?Auth session callbacks may finish while the user is on another page[\s\S]*?matches\('\[data-view="profile"\]'\)\) return;/);
});


test('application starts on the homepage instead of briefly showing the profile screen', () => {
  assert.match(app, /window\.XLiveApp = \{ render, showToast \};\s*render\('home'\);\s*\}\)\(\);/);
  assert.doesNotMatch(app, /window\.XLiveApp = \{ render, showToast \};\s*render\('profile'\);/);
});


test('profile view renders a stable shell before async auth profile data', () => {
  assert.match(app, /if \(view === 'profile'\) \{[\s\S]*?جارٍ تحميل بيانات الحساب[\s\S]*?XLiveAuth\?\.render\(\);\s*return;/);
  assert.match(auth, /async function renderProfile\(\)/);
});


test('profile editing is explicit and sign out lives in the sidebar', () => {
  const auth = readFileSync('auth.js', 'utf8');
  assert.match(auth, /id="profile-save" type="button">تعديل/);
  assert.match(auth, /profile-display-name[\s\S]*?disabled/);
  assert.match(auth, /target\.textContent = 'حفظ التغييرات'/);
  assert.doesNotMatch(auth, /<button class="button button-secondary" id="auth-signout"/);
  assert.match(html, /id="auth-signout"[^>]*hidden/);
  assert.match(html, /sidebar-signout/);
});

test('creator, saved items, and account links live in the sidebar and not the mobile bottom bar', () => {
  const sidebar = html.slice(html.indexOf('<aside class="sidebar"'), html.indexOf('</aside>'));
  const mobileNav = html.slice(html.indexOf('<nav class="mobile-nav"'), html.indexOf('</nav>', html.indexOf('<nav class="mobile-nav"')));
  assert.match(sidebar, /data-view="creator"[^>]*>[\s\S]*?الصفحة الشخصية/);
  assert.match(sidebar, /data-view="saved"[^>]*>[\s\S]*?المحفوظات/);
  assert.match(sidebar, /data-view="profile"[^>]*>[\s\S]*?حسابي/);
  assert.doesNotMatch(mobileNav, /data-view="creator"|data-view="saved"|data-view="profile"|mobile-signout|تسجيل الخروج/);
  assert.match(sidebar, /id="auth-signout"[^>]*hidden/);
  assert.match(sidebar, /sidebar-signout/);
  assert.match(app, /creator: \{ title: 'الصفحة الشخصية'/);
  assert.match(app, /renderCreatorProfile\(\)/);
  assert.match(auth, /data-creator-tab="videos"/);
  assert.match(auth, /data-creator-tab="photos"/);
  assert.match(auth, /creator-live-form/);
  assert.match(auth, /creator-photo-upload-form/);
});


test('moderation result notifications satisfy the database kind constraint', () => {
  const migration = readFileSync('supabase/migrations/0024_allow_moderation_result_notifications.sql', 'utf8');
  assert.match(migration, /notifications_kind_check/i);
  assert.match(migration, /'moderation_result'/i);
});

test('admin feedback is shown in the site instead of browser alert dialogs', () => {
  const admin = readFileSync('admin.js', 'utf8');
  assert.match(admin, /function notify\(message\)/);
  assert.match(admin, /window\.XLiveApp\.showToast\(message\)/);
  assert.doesNotMatch(admin, /alert\('تعذر تحديث المنشور:/);
});


test('creator video cards offer owner-only visibility settings', () => {
  assert.match(auth, /data-video-menu=/);
  assert.match(auth, /data-video-visibility="public"/);
  assert.match(auth, /data-video-visibility="private"/);
  assert.match(auth, /data-video-visibility="profile"/);
  assert.match(auth, /set_own_video_visibility/);
  assert.match(auth, /if \(!isOwnProfile\) query = query\.eq\('status','approved'\)\.in\('visibility',\['public','profile'\]\)/);
});

test('video visibility RPC is restricted to the authenticated owner', () => {
  const migration = readFileSync('supabase/migrations/0025_owner_video_visibility_settings.sql', 'utf8');
  assert.match(migration, /security definer/i);
  assert.match(migration, /owner_id = auth\.uid\(\)/i);
  assert.match(migration, /grant execute on function public\.set_own_video_visibility\(uuid, text\) to authenticated/i);
});


test('profile avatar upload persists a private storage path with public-profile signed reads', () => {
  const avatar = readFileSync('supabase/migrations/0031_profile_avatar_upload.sql', 'utf8');
  assert.match(auth, /profile-avatar-file/);
  assert.match(auth, /photo-originals'\)\.upload\(nextPath/);
  assert.match(auth, /update\(\{avatar_path:nextPath\}\)/);
  assert.match(auth, /createSignedUrl\(profileAvatarPath, 3600\)/);
  assert.match(avatar, /grant update \(avatar_path\) on public\.profiles to authenticated/i);
  assert.match(avatar, /photo_originals_select_profile_avatars/i);
  assert.match(avatar, /p\.id = \(select auth\.uid\(\)\) or p\.is_private = false/i);
});
