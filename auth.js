(() => {
  'use strict';
  const config = window.XLIVE_SUPABASE;
  const root = document.getElementById('app-view');
  if (!root) return;
  let client = null;
  let mode = 'signin';
  let user = null;
  let authReady = false;
  let subscription = null;
  let activeConversationId = null;
  let passwordRecoveryActive = false;
  let profileAvatarPath = null;

  function feedback(message) {
    const node = document.getElementById('auth-feedback');
    if (node) node.textContent = message;
  }
  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'signin';
    const name = document.getElementById('auth-name-wrap');
    const age = document.getElementById('auth-age-wrap');
    const phone = document.getElementById('auth-phone-wrap');
    const submit = document.getElementById('auth-submit');
    const reset = document.getElementById('auth-reset');
    if (name) name.hidden = mode !== 'signup';
    if (age) age.hidden = mode !== 'signup';
    if (phone) phone.hidden = mode !== 'signup';
    if (submit) submit.textContent = mode === 'signup' ? 'إنشاء حساب' : 'تسجيل الدخول';
    if (reset) reset.hidden = mode !== 'signin';
    feedback('');
  }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  async function syncCurrentUser(supabase) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      user = data?.session?.user || null;
      return user;
    } catch (_) { return user; }
  }

  function renderPasswordRecovery() {
    passwordRecoveryActive = true;
    document.body.classList.add('auth-only');
    document.querySelectorAll('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === 'profile'));
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / ACCOUNT SECURITY</p><h1>تعيين كلمة مرور جديدة</h1><p>اختر كلمة مرور جديدة لحسابك.</p></div></div><form id="password-update-form" class="simple-panel form-stack"><div class="field"><label for="new-password">كلمة المرور الجديدة</label><input id="new-password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">تأكيد كلمة المرور</label><input id="confirm-password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required></div><button id="password-update-submit" class="button button-primary" type="submit">حفظ كلمة المرور</button><p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form>';
  }


  let creatorTab = 'videos';
  let creatorUploadOpen = false;
  let creatorCameraStream = null;
  let creatorProfileTarget = null;

  function captureVideoPreview(file) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const url = URL.createObjectURL(file);
      let finished = false;
      const finish = blob => {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(url);
        video.removeAttribute('src');
        video.load();
        resolve(blob || null);
      };
      const draw = () => {
        try {
          const scale = Math.min(1, 640 / (video.videoWidth || 640));
          canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
          canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => finish(blob), 'image/jpeg', 0.78);
        } catch (_) { finish(null); }
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.onloadeddata = () => {
        try { if (Number.isFinite(video.duration) && video.duration > 1) video.currentTime = Math.min(1, video.duration / 2); else draw(); }
        catch (_) { draw(); }
      };
      video.onseeked = draw;
      video.onerror = () => finish(null);
      video.src = url;
      video.load();
    });
  }

  async function renderCreatorProfile(tab = creatorTab, profileId = null) {
    creatorTab = ['videos','photos','live'].includes(tab) ? tab : 'videos';
    if (!document.querySelector('[data-view].active')?.matches('[data-view="creator"]')) return;
    const supabase = ensureClient();
    await syncCurrentUser(supabase);
    if (!supabase || !user) {
      root.innerHTML = '<div class="simple-panel"><h2>الصفحة الشخصية</h2><p>سجّل الدخول لعرض منشوراتك وإنشاء بث.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    const viewedUserId = profileId || user.id;
    const isOwnProfile = viewedUserId === user.id;
    creatorProfileTarget = viewedUserId;
    if (!isOwnProfile) creatorTab = 'videos';
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / CREATOR</p><h1>الصفحة الشخصية</h1><p>' + (isOwnProfile ? 'منشوراتك وصورك وإعداد البث المباشر.' : 'المقاطع المنشورة في هذا الملف الشخصي.') + '</p></div><button class="back-home" data-view="search">العودة للبحث ←</button></div><div class="creator-profile"><div class="creator-identity" id="creator-identity"><div class="creator-avatar">◎</div><div><h2>جارٍ تحميل الملف…</h2></div></div><div class="creator-tabs" role="tablist" aria-label="محتوى الصفحة الشخصية"><button type="button" data-creator-tab="videos" class="' + (creatorTab === 'videos' ? 'active' : '') + '" role="tab" aria-selected="' + (creatorTab === 'videos') + '"><span>▣</span> المقاطع</button><button type="button" data-creator-tab="photos" style="' + (isOwnProfile ? '' : 'display:none') + '" class="' + (creatorTab === 'photos' ? 'active' : '') + '" role="tab" aria-selected="' + (creatorTab === 'photos') + '"><span>▧</span> الصور</button><button type="button" data-creator-tab="live" style="' + (isOwnProfile ? '' : 'display:none') + '" class="' + (creatorTab === 'live' ? 'active' : '') + '" role="tab" aria-selected="' + (creatorTab === 'live') + '"><span>●</span> إنشاء بث لايف</button></div><div id="creator-tab-content" class="creator-tab-content"><p class="field-help">جارٍ تحميل المحتوى…</p></div></div>';
    const {data: profile} = await supabase.from('profiles').select('username,display_name,bio,avatar_path').eq('id', viewedUserId).maybeSingle();
    if (!document.querySelector('[data-view].active')?.matches('[data-view="creator"]') || !user) return;
    const identity = document.getElementById('creator-identity');
    if (identity) {
      let avatar = '<div class="creator-avatar" aria-hidden="true">' + escapeHtml((profile?.display_name || profile?.username || user.email || 'م').slice(0,1).toUpperCase()) + '</div>';
      if (profile?.avatar_path) {
        const {data: signedAvatar} = await supabase.storage.from('photo-originals').createSignedUrl(profile.avatar_path, 3600);
        if (signedAvatar?.signedUrl) avatar = '<img class="creator-avatar" src="' + escapeHtml(signedAvatar.signedUrl) + '" alt="صورة المستخدم">';
      }
      identity.innerHTML = avatar + '<div><h2>' + escapeHtml(profile?.display_name || profile?.username || 'مستخدم XLive18') + '</h2><p>@' + escapeHtml(profile?.username || '') + '</p><p class="creator-bio">' + escapeHtml(profile?.bio || 'أهلاً بك في صفحتي الشخصية.') + '</p></div>';
    }
    const panel = document.getElementById('creator-tab-content');
    if (!panel) return;
    if (creatorTab === 'videos') {
      let query = supabase.from('videos').select('id,title,description,storage_path,preview_path,status,visibility,created_at').eq('owner_id', viewedUserId).order('created_at',{ascending:false}).limit(60);
      if (!isOwnProfile) query = query.eq('status','approved').in('visibility',['public','profile']);
      const {data: rows, error} = await query;
      if (error) { panel.innerHTML = '<div class="empty-panel"><h3>تعذر تحميل المقاطع</h3><p>تحقق من إعدادات قاعدة البيانات والصلاحيات.</p></div>'; return; }
      const cards = await Promise.all((rows || []).map(async v => {
        const locked = !isOwnProfile && v.visibility === 'private';
        let media = '<div class="clip-placeholder">المعاينة غير متاحة</div>';
        if (!locked && (isOwnProfile || (v.status === 'approved' && ['public','profile'].includes(v.visibility)))) {
          const {data: signed} = await supabase.storage.from('video-originals').createSignedUrl(v.storage_path, 3600);
          media = signed?.signedUrl ? '<video class="clip-player" controls playsinline preload="metadata" src="' + escapeHtml(signed.signedUrl) + '"></video>' : '<div class="clip-placeholder">المعاينة غير متاحة</div>';
        }
        if (locked) {
          let previewMarkup = '';
          if (v.preview_path) {
            const {data: preview} = await supabase.storage.from('video-originals').createSignedUrl(v.preview_path, 3600);
            if (preview?.signedUrl) previewMarkup = '<img class="private-video-thumb" src="' + escapeHtml(preview.signedUrl) + '" alt="" loading="lazy">';
          }
          media = '<div class="private-video-preview" aria-label="مقطع خاص">' + previewMarkup + '<span class="private-video-lock">🔒</span><strong>خاص</strong></div>';
        }
        const status = v.status === 'approved' ? (v.visibility === 'private' ? 'خاص' : v.visibility === 'profile' ? 'الملف الشخصي فقط' : 'منشور') : v.status === 'rejected' ? 'مرفوض' : v.status === 'removed' ? 'محذوف' : 'قيد المراجعة';
        return '<article class="clip-card ' + (locked ? 'clip-card-private' : '') + '">' + media + '<div class="clip-card-body"><div class="clip-card-heading"><strong>' + escapeHtml(v.title) + '</strong><span class="status-pill">' + status + '</span></div>' + (isOwnProfile ? '<div class="creator-clip-settings"><button type="button" class="creator-clip-menu-button" data-video-menu="' + v.id + '" aria-label="تخصيص ظهور المقطع" aria-expanded="false">⋮</button><div class="creator-clip-menu" data-video-menu-panel="' + v.id + '" hidden><p>مكان ظهور المقطع</p><button type="button" data-video-visibility="public" data-video-id="' + v.id + '" ' + (v.visibility === 'public' ? 'aria-current="true"' : '') + '>🌐 عام</button><button type="button" data-video-visibility="private" data-video-id="' + v.id + '" ' + (v.visibility === 'private' ? 'aria-current="true"' : '') + '>🔒 خاص</button><button type="button" data-video-visibility="profile" data-video-id="' + v.id + '" ' + (v.visibility === 'profile' ? 'aria-current="true"' : '') + '>◎ الصفحة الشخصية فقط</button></div></div>' : '') + (locked ? '<p>هذا المقطع خاص ولا يمكن تشغيله.</p>' : '<p>' + escapeHtml(v.description || '') + '</p>') + '<small>' + shortDate(v.created_at) + '</small></div></article>';
      }));
      panel.innerHTML = '<div class="creator-panel-heading"><div><h3>' + (isOwnProfile ? 'مقاطعك' : 'المقاطع') + '</h3><p>' + (isOwnProfile ? 'اختر مكان ظهور كل مقطع؛ النشر للعامة يتطلب الموافقة.' : 'المقاطع العامة ومقاطع الملف الشخصي تظهر بعد الموافقة. المقاطع الخاصة تظهر بقفل فقط.') + '</p></div>' + (isOwnProfile ? '<button class="button button-primary creator-plus" type="button" data-creator-upload="video" aria-label="إضافة مقطع">＋ إضافة مقطع</button>' : '') + '</div>' +
        (isOwnProfile && creatorUploadOpen ? '<form id="creator-video-upload-form" class="simple-panel form-stack"><div class="field"><label for="creator-video-title">عنوان المقطع</label><input id="creator-video-title" maxlength="120" required></div><div class="field"><label for="creator-video-description">الوصف</label><textarea id="creator-video-description" maxlength="2000" rows="3"></textarea></div><fieldset class="field visibility-options"><legend>مين بيقدر يشوف المقطع؟</legend><label class="visibility-option"><input type="radio" name="creator-video-visibility" value="public" checked><span class="visibility-check" aria-hidden="true"></span><span><strong>المقطع عام</strong><small>بيظهر بالصفحة الرئيسية وبالملف الشخصي بعد الموافقة.</small></span></label><label class="visibility-option"><input type="radio" name="creator-video-visibility" value="private"><span class="visibility-check" aria-hidden="true"></span><span><strong>خاص</strong><small>أنت فقط بتقدر تشغّله؛ بيظهر للزوار كعنصر مقفول.</small></span></label><label class="visibility-option"><input type="radio" name="creator-video-visibility" value="profile"><span class="visibility-check" aria-hidden="true"></span><span><strong>فقط بالملف الشخصي</strong><small>بيظهر بملفك بعد الموافقة، وما بيظهر بالرئيسية.</small></span></label></fieldset><div class="field"><label for="creator-video-file">ملف الفيديو</label><input id="creator-video-file" type="file" accept="video/mp4,video/webm,video/quicktime" required><p class="field-help">MP4 أو WebM أو MOV — حتى 50 ميغابايت.</p></div><button class="button button-primary" id="creator-video-submit" type="submit">رفع وإرسال للمراجعة</button><p id="creator-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form>' : '') +
        (cards.length ? '<div class="creator-media-grid">' + cards.join('') + '</div>' : '<div class="empty-panel"><h3>' + (isOwnProfile ? 'لسه ما نشرت مقاطع' : 'ما في مقاطع ظاهرة') + '</h3><p>' + (isOwnProfile ? 'اضغط «إضافة مقطع» لرفع أول فيديو. سيبقى قيد المراجعة قبل نشره.' : 'ما في مقاطع متاحة للعرض في هذا الملف الشخصي حالياً.') + '</p></div>');
    } else if (creatorTab === 'photos') {
      const {data: photos, error} = await supabase.from('photos').select('id,title,description,storage_path,status,created_at').eq('owner_id', user.id).order('created_at',{ascending:false}).limit(100);
      if (error) { panel.innerHTML = '<div class="empty-panel"><h3>تعذر تحميل الصور</h3><p>تأكد من تطبيق ترحيل قاعدة البيانات الخاص بالصور.</p></div>'; return; }
      const cards = await Promise.all((photos || []).map(async p => {
        const {data: signed} = await supabase.storage.from('photo-originals').createSignedUrl(p.storage_path, 3600);
        return '<article class="creator-photo-card">' + (signed?.signedUrl ? '<img src="' + escapeHtml(signed.signedUrl) + '" alt="' + escapeHtml(p.title || 'صورة منشورة') + '" loading="lazy">' : '<div class="clip-placeholder">الصورة غير متاحة</div>') + '<div class="clip-card-body"><strong>' + escapeHtml(p.title || 'صورة') + '</strong><span class="status-pill">' + (p.status === 'approved' ? 'منشورة' : p.status === 'rejected' ? 'مرفوضة' : 'قيد المراجعة') + '</span></div></article>';
      }));
      panel.innerHTML = '<div class="creator-panel-heading"><div><h3>صورك</h3><p>تُحفظ الصور بشكل خاص وتبقى قيد المراجعة قبل النشر.</p></div><button class="button button-primary creator-plus" type="button" data-creator-upload="photo" aria-label="إضافة صورة">＋ إضافة صورة</button></div>' +
        (creatorUploadOpen ? '<form id="creator-photo-upload-form" class="simple-panel form-stack"><div class="field"><label for="creator-photo-title">عنوان الصورة (اختياري)</label><input id="creator-photo-title" maxlength="120" placeholder="عنوان بسيط"></div><div class="field"><label for="creator-photo-description">الوصف (اختياري)</label><textarea id="creator-photo-description" maxlength="2000" rows="2"></textarea></div><div class="field"><label for="creator-photo-file">ملف الصورة</label><input id="creator-photo-file" type="file" accept="image/jpeg,image/png,image/webp" required><p class="field-help">JPG أو PNG أو WebP — حتى 10 ميغابايت.</p></div><button class="button button-primary" id="creator-photo-submit" type="submit">رفع الصورة وإرسالها للمراجعة</button><p id="creator-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form>' : '') +
        (cards.length ? '<div class="creator-photo-grid">' + cards.join('') + '</div>' : '<div class="empty-panel"><h3>ما في صور لحد الآن</h3><p>اضغط «إضافة صورة» لاختيار صورة من جهازك ورفعها بأمان.</p></div>');
    } else {
      panel.innerHTML = '<div class="creator-live-layout"><div class="simple-panel form-stack"><p class="eyebrow">LIVE STUDIO</p><h3>إعداد البث المباشر</h3><p class="field-help">جهّز عنوان البث والكاميرا والميكروفون قبل البدء. إنشاء بث فعلي يحتاج ربط مزوّد بث وإعدادات خادم آمنة؛ لن نعلن أنك مباشر قبل توفر الاتصال الحقيقي.</p><form id="creator-live-form" class="form-stack"><div class="field"><label for="creator-live-title">عنوان البث</label><input id="creator-live-title" maxlength="120" required placeholder="شو موضوع بثك؟"></div><div class="field"><label for="creator-live-description">وصف البث</label><textarea id="creator-live-description" maxlength="1000" rows="3" placeholder="عرّف المشاهدين على البث"></textarea></div><div class="field"><label for="creator-live-mode">نوع البث</label><select id="creator-live-mode"><option value="video">كاميرا وصوت</option><option value="audio">صوت فقط</option></select></div><div class="field"><label for="creator-live-visibility">الخصوصية</label><select id="creator-live-visibility"><option value="public">عام</option><option value="private">خاص</option></select></div><div class="field"><label for="creator-live-capacity">السعة</label><select id="creator-live-capacity"><option value="2">2 مشاركين</option><option value="8" selected>8 مشاركين</option><option value="12">12 مشاركاً</option><option value="25">25 مشاركاً</option><option value="50">50 مشاركاً</option></select></div><button class="button button-primary" id="creator-live-submit" type="submit">حفظ إعدادات البث</button><p id="creator-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form></div><div class="simple-panel creator-preview-panel"><div class="creator-preview-head"><strong>معاينة الكاميرا</strong><span class="status-pill">معاينة محلية</span></div><video id="creator-camera-preview" autoplay muted playsinline></video><p class="field-help">المعاينة على جهازك فقط، ولا يتم بثها للمشاهدين.</p><div class="social-actions"><button class="button button-secondary" type="button" data-creator-camera="start">تشغيل الكاميرا والميكروفون</button><button class="button button-secondary" type="button" data-creator-camera="stop">إيقاف المعاينة</button></div></div></div>';
    }
  }

  document.addEventListener('click', async event => {
    const menuButton = event.target.closest('[data-video-menu]');
    if (menuButton) {
      event.preventDefault();
      const id = menuButton.dataset.videoMenu;
      const menu = root.querySelector('[data-video-menu-panel="' + id + '"]');
      if (menu) {
        const opening = menu.hidden;
        root.querySelectorAll('[data-video-menu-panel]').forEach(node => { node.hidden = true; });
        root.querySelectorAll('[data-video-menu]').forEach(node => node.setAttribute('aria-expanded', 'false'));
        menu.hidden = !opening;
        menuButton.setAttribute('aria-expanded', String(opening));
      }
      return;
    }
    const visibilityButton = event.target.closest('[data-video-visibility]');
    if (visibilityButton) {
      event.preventDefault();
      const supabase = ensureClient(); await syncCurrentUser(supabase);
      if (!supabase || !user || creatorProfileTarget !== user.id) { window.XLiveApp?.showToast('يمكن لصاحب المقطع فقط تعديل ظهوره.'); return; }
      const visibility = visibilityButton.dataset.videoVisibility;
      visibilityButton.disabled = true;
      const {error} = await supabase.rpc('set_own_video_visibility', {p_video_id:visibilityButton.dataset.videoId,p_visibility:visibility});
      if (error) {
        window.XLiveApp?.showToast('تعذر تعديل ظهور المقطع. حاول مجدداً.');
        console.error('XLive video visibility update failed', error);
        visibilityButton.disabled = false;
        return;
      }
      creatorUploadOpen = false;
      await renderCreatorProfile('videos', user.id);
      window.XLiveApp?.showToast(({public:'أصبح المقطع عاماً بعد اجتياز المراجعة.',private:'أصبح المقطع خاصاً بصاحبه.',profile:'سيظهر المقطع في الصفحة الشخصية فقط بعد الموافقة.'})[visibility] || 'تم حفظ إعداد الظهور.');
      return;
    }
    const tab = event.target.closest('[data-creator-tab]');
    if (tab) { event.preventDefault(); creatorUploadOpen = false; if (creatorCameraStream) { creatorCameraStream.getTracks().forEach(track => track.stop()); creatorCameraStream = null; } await renderCreatorProfile(tab.dataset.creatorTab, creatorProfileTarget || user?.id); }
    const upload = event.target.closest('[data-creator-upload]');
    if (upload) { event.preventDefault(); creatorUploadOpen = !creatorUploadOpen; await renderCreatorProfile(upload.dataset.creatorUpload === 'photo' ? 'photos' : 'videos'); return; }
    const camera = event.target.closest('[data-creator-camera]');
    if (camera) {
      event.preventDefault();
      const feedbackNode = document.getElementById('creator-feedback');
      if (camera.dataset.creatorCamera === 'stop') {
        if (creatorCameraStream) creatorCameraStream.getTracks().forEach(track => track.stop());
        creatorCameraStream = null;
        const preview = document.getElementById('creator-camera-preview'); if (preview) preview.srcObject = null;
        if (feedbackNode) feedbackNode.textContent = 'تم إيقاف المعاينة.';
        return;
      }
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable');
        if (creatorCameraStream) creatorCameraStream.getTracks().forEach(track => track.stop());
        creatorCameraStream = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
        const preview = document.getElementById('creator-camera-preview'); if (preview) preview.srcObject = creatorCameraStream;
        if (feedbackNode) feedbackNode.textContent = 'المعاينة تعمل محلياً فقط؛ لم يبدأ بث للمشاهدين.';
      } catch (error) { if (feedbackNode) feedbackNode.textContent = 'تعذر تشغيل الكاميرا أو الميكروفون. تحقق من أذونات المتصفح واتصال HTTPS.'; }
    }
  });

  async function renderProfile() {
    // Auth session callbacks may finish while the user is on another page; never let them replace the homepage.
    if (!document.querySelector('[data-view].active')?.matches('[data-view="profile"]')) return;
    if (user) {
      document.body.classList.remove('auth-only');
      let profile = { display_name: '', username: '', bio: '', is_private: false };
      const supabase = ensureClient();
      if (supabase) {
        const { data } = await supabase.from('profiles').select('display_name,username,bio,is_private,avatar_path').eq('id', user.id).maybeSingle();
        if (data) profile = data;
      }
      if (!document.querySelector('[data-view].active')?.matches('[data-view="profile"]') || !user) return;
      const signoutButton = document.getElementById('auth-signout');
      if (signoutButton) signoutButton.hidden = false;
      root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / PROFILE</p><h1>ملفي الشخصي</h1><p>خلّي حسابك يعكس شخصيتك.</p></div></div><div class="simple-panel auth-panel"><p class="eyebrow">الحساب المتصل</p><p class="profile-email">' + escapeHtml(user.email) + '</p><section class="profile-avatar-card" aria-label="الصورة الشخصية"><div class="profile-avatar-preview" id="profile-avatar-preview"><span>' + escapeHtml((profile.display_name || profile.username || user.email || 'م').slice(0,1).toUpperCase()) + '</span></div><div class="profile-avatar-controls"><strong>الصورة الشخصية</strong><p>ارفع صورة واضحة لحسابك. JPG أو PNG أو WebP، حتى 5 ميغابايت.</p><input id="profile-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="اختر صورة شخصية"><div class="profile-avatar-actions"><button class="button button-primary" id="profile-avatar-save" type="button">حفظ الصورة</button><button class="button button-secondary" id="profile-avatar-remove" type="button" ' + (profile.avatar_path ? '' : 'hidden') + '>إزالة الصورة</button></div><p id="profile-avatar-feedback" class="auth-feedback" role="status" aria-live="polite"></p></div></section><form id="profile-form" class="form-stack"><div class="field"><label for="profile-username">اسم المستخدم</label><input id="profile-username" value="' + escapeHtml(profile.username) + '" disabled><p class="field-help">اسم المستخدم الحالي.</p></div><div class="field"><label for="profile-display-name">الاسم الظاهر</label><input id="profile-display-name" maxlength="60" value="' + escapeHtml(profile.display_name) + '" placeholder="الاسم الذي يراه الآخرون" disabled></div><div class="field"><label for="profile-bio">نبذة عنك</label><textarea id="profile-bio" maxlength="500" rows="4" placeholder="احكي باختصار عنك…" disabled>' + escapeHtml(profile.bio) + '</textarea></div><label class="auth-age"><input id="profile-private" type="checkbox" ' + (profile.is_private ? 'checked' : '') + ' disabled> جعل حسابي خاصاً</label><button class="button button-primary" id="profile-save" type="button">تعديل</button></form><p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite"></p></div>';
      profileAvatarPath = profile.avatar_path || null;
      if (profileAvatarPath) {
        const {data: avatarData, error: avatarError} = await supabase.storage.from('photo-originals').createSignedUrl(profileAvatarPath, 3600);
        const preview = document.getElementById('profile-avatar-preview');
        if (!avatarError && avatarData?.signedUrl && preview) preview.innerHTML = '<img src="' + escapeHtml(avatarData.signedUrl) + '" alt="الصورة الشخصية الحالية">';
      }
      root.insertAdjacentHTML('beforeend', '<section class="simple-panel social-inbox"><h2>طلبات المتابعة</h2><div id="follow-requests-panel"><p class="field-help">جارٍ تحميل الطلبات…</p></div><h2>الحسابات المحظورة</h2><div id="blocked-accounts-panel"><p class="field-help">جارٍ تحميل قائمة الحظر…</p></div></section>');
      renderSocialInbox();
      return;
    }
    document.body.classList.add('auth-only');
    const signoutButton = document.getElementById('auth-signout');
    if (signoutButton) signoutButton.hidden = true;
    root.innerHTML = '<section class="auth-screen"><a class="auth-brand" href="#" aria-label="XLIVE 18"><span class="brand-mark">X</span><span>LIVE <b>18</b></span></a><div class="auth-intro"><h1>أهلاً بك في XLIVE 18</h1><p>سجّل الدخول أو أنشئ حسابك للمتابعة.</p></div><div class="simple-panel auth-panel"><div class="auth-tabs"><button type="button" class="button button-primary" data-auth-mode="signin">تسجيل الدخول</button><button type="button" class="button button-secondary" data-auth-mode="signup">إنشاء حساب</button></div><form id="auth-form" class="form-stack"><div class="field" id="auth-name-wrap" hidden><label for="auth-name">الاسم الظاهر</label><input id="auth-name" maxlength="40" autocomplete="nickname" placeholder="اسم العرض"></div><div class="field"><label for="auth-email">البريد الإلكتروني</label><input id="auth-email" type="email" required autocomplete="email" maxlength="254" placeholder="you@example.com"></div><div class="field" id="auth-phone-wrap" hidden><label for="auth-phone">رقم الهاتف</label><div class="phone-input-group" dir="ltr"><span class="phone-country-code" aria-label="رمز الاتصال الدولي السوري">+963</span><input id="auth-phone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" pattern="09[0-9]{8}" placeholder="09XXXXXXXX" aria-describedby="auth-phone-help" required></div><small id="auth-phone-help">أدخل رقم الجوال المحلي من 10 أرقام، ويبدأ بـ 09.</small></div><div class="field"><label for="auth-password">كلمة المرور</label><input id="auth-password" type="password" required minlength="8" maxlength="72" autocomplete="current-password" placeholder="8 أحرف على الأقل"></div><label class="auth-age" id="auth-age-wrap" hidden><input id="auth-age" type="checkbox"> أؤكد أن عمري 18 عاماً أو أكثر.</label><button class="button button-primary" id="auth-submit" type="submit">تسجيل الدخول</button><p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form></div></section>';
    setMode(mode);
  }
  function ensureClient() {
    if (client) return client;
    if (!config?.url || !config?.key || !window.supabase?.createClient) return null;
    client = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.getSession().then(async ({data}) => {
      user = data?.session?.user || null;
      authReady = true;
      const signoutButton = document.getElementById('auth-signout');
      if (signoutButton) signoutButton.hidden = !user;
      if (passwordRecoveryActive) return;
      if (user) document.body.classList.remove('auth-only');
      // Check approval before restoring any protected route after a page refresh.
      if (user && !passwordRecoveryActive) await showAccountApprovalState(client, false, true);
      else window.XLiveApp?.restoreCurrentRoute();
    }).catch(() => {
      authReady = true;
      window.XLiveApp?.restoreCurrentRoute();
    });
    const result = client.auth.onAuthStateChange((event, session) => {
      user = session?.user || null;
      // INITIAL_SESSION can arrive before getSession() settles; keep protected routes gated until then.
      if (event !== 'INITIAL_SESSION') authReady = true;
      const signoutButton = document.getElementById('auth-signout');
      if (signoutButton) signoutButton.hidden = !user;
      if (event === 'PASSWORD_RECOVERY') { renderPasswordRecovery(); return; }
      if (passwordRecoveryActive) return;
      if (event === 'SIGNED_OUT') {
        document.body.classList.add('auth-only');
        window.XLiveApp?.navigate('profile');
        return;
      }
      if (event === 'SIGNED_IN') return; // The signup/signin handler checks approval before navigation.
      if (user) document.body.classList.remove('auth-only');
      // Session refreshes preserve the current route; approval is checked on initial session restore.
      window.XLiveApp?.restoreCurrentRoute();
    });
    subscription = result?.data?.subscription || null;
    return client;
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-auth-mode],#auth-signout,#auth-reset,#profile-save,#profile-avatar-save,#profile-avatar-remove');
    if (!target) return;
    if (target.id === 'profile-avatar-save' || target.id === 'profile-avatar-remove') {
      event.preventDefault();
      const supabase = ensureClient();
      await syncCurrentUser(supabase);
      if (!supabase || !user) { feedback('سجّل الدخول أولاً.'); return; }
      const message = document.getElementById('profile-avatar-feedback');
      const saveButton = document.getElementById('profile-avatar-save');
      const removeButton = document.getElementById('profile-avatar-remove');
      const preview = document.getElementById('profile-avatar-preview');
      const file = document.getElementById('profile-avatar-file')?.files?.[0];
      const allowed = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      if (target.id === 'profile-avatar-save') {
        if (!file || !allowed[file.type]) { if (message) message.textContent = 'اختر صورة JPG أو PNG أو WebP أولاً.'; return; }
        if (file.size > 5 * 1024 * 1024) { if (message) message.textContent = 'حجم الصورة أكبر من 5 ميغابايت.'; return; }
      } else if (!profileAvatarPath) {
        if (message) message.textContent = 'ما في صورة شخصية لإزالتها.';
        return;
      }
      const oldPath = profileAvatarPath;
      if (saveButton) { saveButton.disabled = true; saveButton.textContent = target.id === 'profile-avatar-save' ? 'جارٍ رفع الصورة…' : 'جارٍ التحديث…'; }
      if (removeButton) removeButton.disabled = true;
      try {
        let nextPath = null;
        if (target.id === 'profile-avatar-save') {
          const id = window.crypto?.randomUUID?.();
          if (!id) throw new Error('Secure random IDs unavailable');
          nextPath = user.id + '/avatars/' + id + '.' + allowed[file.type];
          const {error: uploadError} = await supabase.storage.from('photo-originals').upload(nextPath, file, {contentType:file.type,upsert:false,cacheControl:'3600'});
          if (uploadError) throw uploadError;
        }
        const {error: updateError} = await supabase.from('profiles').update({avatar_path:nextPath}).eq('id',user.id);
        if (updateError) {
          if (nextPath) await supabase.storage.from('photo-originals').remove([nextPath]);
          throw updateError;
        }
        profileAvatarPath = nextPath;
        if (preview) {
          if (nextPath) {
            const {data: signed, error: signedError} = await supabase.storage.from('photo-originals').createSignedUrl(nextPath,3600);
            if (!signedError && signed?.signedUrl) preview.innerHTML = '<img src="' + escapeHtml(signed.signedUrl) + '" alt="الصورة الشخصية الحالية">';
          } else {
            const initial = (document.getElementById('profile-display-name')?.value || user.email || 'م').trim().slice(0,1).toUpperCase();
            preview.innerHTML = '<span>' + escapeHtml(initial) + '</span>';
          }
        }
        if (removeButton) removeButton.hidden = !nextPath;
        if (oldPath && oldPath.startsWith(user.id + '/avatars/')) {
          const {error: removeOldError} = await supabase.storage.from('photo-originals').remove([oldPath]);
          if (removeOldError) console.warn('XLive old avatar cleanup skipped',removeOldError);
        }
        const fileInput = document.getElementById('profile-avatar-file');
        if (fileInput) fileInput.value = '';
        if (message) message.textContent = target.id === 'profile-avatar-save' ? 'تم تحديث صورتك الشخصية بنجاح.' : 'تمت إزالة الصورة الشخصية.';
        window.XLiveApp?.showToast(target.id === 'profile-avatar-save' ? 'تم حفظ الصورة الشخصية.' : 'تمت إزالة الصورة الشخصية.');
      } catch (error) {
        if (message) message.textContent = 'تعذر تحديث الصورة الشخصية. تحقق من الاتصال والصلاحيات وحاول مجدداً.';
        console.error('XLive avatar update failed',error);
      } finally {
        if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'حفظ الصورة'; }
        if (removeButton) removeButton.disabled = false;
      }
      return;
    }
    if (target.id === 'profile-save') {
      event.preventDefault();
      const form = document.getElementById('profile-form');
      if (!form) return;
      const fields = ['profile-display-name','profile-bio','profile-private'].map(id => document.getElementById(id)).filter(Boolean);
      if (target.dataset.editing !== 'true') {
        fields.forEach(field => { field.disabled = false; });
        target.dataset.editing = 'true';
        target.type = 'submit';
        target.textContent = 'حفظ التغييرات';
        document.getElementById('profile-display-name')?.focus();
      } else {
        event.preventDefault();
        form.requestSubmit();
      }
      return;
    }
    if (target.matches('[data-auth-mode]')) { setMode(target.dataset.authMode); return; }
    const supabase = ensureClient();
    if (!supabase) { feedback('خدمة الحسابات غير مهيأة بعد.'); return; }
    if (target.id === 'auth-signout') {
      const {error} = await supabase.auth.signOut();
      feedback(error ? 'تعذر تسجيل الخروج، حاول مجدداً.' : 'تم تسجيل الخروج.');
    } else if (target.id === 'auth-reset') {
      const email = document.getElementById('auth-email')?.value.trim();
      if (!email) { feedback('أدخل بريدك الإلكتروني أولاً.'); return; }
      const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: 'https://xlive18.xlive18-official.workers.dev'});
      feedback(error ? 'تعذر إرسال تعليمات الاستعادة. تحقق من إعدادات البريد.' : 'إذا كان البريد مسجلاً، فستصلك تعليمات الاستعادة.');
    }
  });
  async function showAccountApprovalState(supabase, justRegistered, preserveRoute = false) {
    const current = user || (await supabase.auth.getUser()).data?.user;
    if (!current) return;
    // Administrators must never be trapped by a missing/stale profile approval row.
    const isAdmin = current.app_metadata?.role === 'admin' || String(current.email || '').trim().toLowerCase() === 'xlive18.official@gmail.com';
    if (isAdmin) {
      document.body.classList.remove('auth-only');
      if (!preserveRoute) {
        feedback(justRegistered ? 'تم تسجيل الحساب الإداري.' : 'تم تسجيل الدخول.');
        window.XLiveApp?.navigate('home');
      } else {
        document.body.classList.remove('auth-only');
        window.XLiveApp?.restoreCurrentRoute();
      }
      return;
    }
    const { data: profile, error } = await supabase.from('profiles').select('account_status').eq('id', current.id).maybeSingle();
    if (error || !profile) {
      feedback('تعذر التحقق من حالة الحساب بسبب مشكلة في ملف المستخدم. أعد المحاولة، وإذا استمرت المشكلة تواصل مع الإدارة.');
      console.error('XLive account approval status lookup failed', error);
      return;
    }
    if (profile.account_status === 'approved') {
      document.body.classList.remove('auth-only');
      if (!preserveRoute) {
        feedback(justRegistered ? 'تمت الموافقة على الحساب.' : 'تم تسجيل الدخول.');
        window.XLiveApp?.navigate('home');
      } else {
        document.body.classList.remove('auth-only');
        window.XLiveApp?.restoreCurrentRoute();
      }
      return;
    }
    document.body.classList.add('auth-only');
    root.innerHTML = '<section class="approval-wait-screen"><div class="approval-wait-mark" aria-hidden="true">◷</div><p class="eyebrow">XLIVE 18 / ACCOUNT REVIEW</p><h1>' + (profile.account_status === 'rejected' ? 'تعذّر قبول الحساب' : 'حسابك بانتظار الموافقة') + '</h1><p>' + (profile.account_status === 'rejected' ? 'لم تتم الموافقة على إنشاء الحساب. تواصل مع الإدارة إذا كنت تعتقد أن هذا خطأ.' : 'تم استلام طلب إنشاء حسابك بنجاح. ستتمكن من دخول الصفحة الرئيسية بعد موافقة الإدارة على الحساب.') + '</p><p class="approval-wait-status"><span class="status-dot"></span>' + (profile.account_status === 'rejected' ? 'مرفوض' : 'قيد المراجعة') + '</p><button type="button" class="button button-secondary" id="approval-check-status">تحقق من حالة الطلب</button><button type="button" class="button button-secondary" id="approval-signout">تسجيل الخروج</button><p id="approval-feedback" class="auth-feedback" role="status" aria-live="polite"></p></section>';
    document.getElementById('approval-check-status')?.addEventListener('click', async () => {
      const note = document.getElementById('approval-feedback');
      if (note) note.textContent = 'جارٍ التحقق…';
      await showAccountApprovalState(supabase, false);
    });
    document.getElementById('approval-signout')?.addEventListener('click', async () => {
      await supabase.auth.signOut();
      user = null;
      window.XLiveApp?.navigate('profile');
    });
  }

  document.addEventListener('submit', async event => {
    if (event.target.id === 'password-update-form') {
      event.preventDefault();
      const supabase = ensureClient();
      const password = document.getElementById('new-password').value;
      const confirm = document.getElementById('confirm-password').value;
      if (password.length < 8 || password.length > 72) { feedback('استخدم كلمة مرور من 8 إلى 72 حرفاً.'); return; }
      if (password !== confirm) { feedback('كلمتا المرور غير متطابقتين.'); return; }
      const button = document.getElementById('password-update-submit'); button.disabled = true; button.textContent = 'جارٍ الحفظ…';
      const {error} = await supabase.auth.updateUser({password});
      if (error) { feedback('تعذر تحديث كلمة المرور. افتح رابط الاستعادة الجديد وحاول مجدداً.'); button.disabled=false; button.textContent='حفظ كلمة المرور'; return; }
      passwordRecoveryActive = false;
      root.innerHTML = '<div class="simple-panel"><h2>تم تحديث كلمة المرور</h2><p>يمكنك الآن استخدام كلمة المرور الجديدة.</p><button class="button button-primary" data-view="profile">العودة إلى الحساب</button></div>';
      return;
    }
    if (event.target.id === 'creator-photo-upload-form') {
      event.preventDefault();
      const supabase = ensureClient(); await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const file = document.getElementById('creator-photo-file')?.files?.[0];
      const allowed = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
      if (!file || !allowed[file.type]) { messageSocial('اختر صورة JPG أو PNG أو WebP.'); return; }
      if (file.size > 10 * 1024 * 1024) { messageSocial('حجم الصورة يتجاوز 10 ميغابايت.'); return; }
      const button = document.getElementById('creator-photo-submit'); button.disabled = true; button.textContent = 'جارٍ رفع الصورة…';
      let path = '';
      try {
        const id = window.crypto?.randomUUID?.(); if (!id) throw new Error('Secure random IDs unavailable');
        path = user.id + '/' + id + '.' + allowed[file.type];
        const {error: uploadError} = await supabase.storage.from('photo-originals').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
        if (uploadError) throw uploadError;
        const {error: rowError} = await supabase.from('photos').insert({owner_id:user.id,title:document.getElementById('creator-photo-title')?.value.trim() || '',description:document.getElementById('creator-photo-description')?.value.trim() || '',storage_path:path,status:'pending',visibility:'public'});
        if (rowError) { await supabase.storage.from('photo-originals').remove([path]); throw rowError; }
        creatorUploadOpen = false; await renderCreatorProfile('photos'); window.XLiveApp?.showToast('تم رفع الصورة وإرسالها للمراجعة. لن تُنشر للعامة قبل الموافقة.');
      } catch (error) { const f=document.getElementById('creator-feedback'); if (f) f.textContent='تعذر رفع الصورة. تأكد من تطبيق ترحيل الصور والصلاحيات ثم حاول مجدداً.'; console.error('XLive photo upload error',error); if (document.getElementById('creator-photo-submit')) { button.disabled=false; button.textContent='رفع الصورة وإرسالها للمراجعة'; } }
      return;
    }
    if (event.target.id === 'creator-video-upload-form') {
      event.preventDefault();
      const supabase = ensureClient(); await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const title=document.getElementById('creator-video-title')?.value.trim(), description=document.getElementById('creator-video-description')?.value.trim() || '', file=document.getElementById('creator-video-file')?.files?.[0], visibility=document.querySelector('input[name="creator-video-visibility"]:checked')?.value || 'public';
      const allowed={'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
      if (!title || title.length>120 || description.length>2000) { messageSocial('تحقق من العنوان والوصف.'); return; }
      if (!file || !allowed[file.type]) { messageSocial('اختر فيديو MP4 أو WebM أو MOV.'); return; }
      if (file.size>50*1024*1024) { messageSocial('حجم الفيديو يتجاوز 50 ميغابايت.'); return; }
      const button=document.getElementById('creator-video-submit'); button.disabled=true; button.textContent='جارٍ الرفع…';
      let path='';
      try {
        const id=window.crypto?.randomUUID?.(); if (!id) throw new Error('Secure random IDs unavailable');
        path=user.id+'/'+id+'.'+allowed[file.type];
        const {error: uploadError}=await supabase.storage.from('video-originals').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
        if (uploadError) throw uploadError;
        let previewPath = null;
        try {
          const previewBlob = await captureVideoPreview(file);
          if (previewBlob) {
            const candidate = user.id + '/previews/' + id + '.jpg';
            const {error: previewError} = await supabase.storage.from('video-originals').upload(candidate, previewBlob, {contentType:'image/jpeg',upsert:false,cacheControl:'3600'});
            if (!previewError) previewPath = candidate;
            else console.warn('XLive video preview upload skipped', previewError);
          }
        } catch (previewError) { console.warn('XLive video preview generation skipped', previewError); }
        const {error: rowError}=await supabase.from('videos').insert({owner_id:user.id,title,description,storage_path:path,preview_path:previewPath,status:'pending',visibility,is_paid:false});
        if (rowError) {
          await supabase.storage.from('video-originals').remove([path]);
          if (previewPath) await supabase.storage.from('video-originals').remove([previewPath]);
          throw rowError;
        }
        creatorUploadOpen=false; await renderCreatorProfile('videos'); window.XLiveApp?.showToast('تم رفع المقطع وإرساله للمراجعة. سيظهر للعامة بعد الموافقة.');
      } catch (error) { const f=document.getElementById('creator-feedback'); if (f) f.textContent='تعذر رفع الفيديو. تحقق من إعدادات التخزين والصلاحيات وحجم الملف.'; console.error('XLive creator video upload error',error); if (document.getElementById('creator-video-submit')) { button.disabled=false; button.textContent='رفع وإرسال للمراجعة'; } }
      return;
    }
    if (event.target.id === 'creator-live-form') {
      event.preventDefault();
      const supabase=ensureClient(); await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const button=document.getElementById('creator-live-submit'); button.disabled=true; button.textContent='جارٍ حفظ الإعدادات…';
      const room={host_id:user.id,title:document.getElementById('creator-live-title').value.trim(),description:document.getElementById('creator-live-description').value.trim(),media_mode:document.getElementById('creator-live-mode').value,visibility:document.getElementById('creator-live-visibility').value,capacity:Number(document.getElementById('creator-live-capacity').value),status:'pending'};
      try {
        const {error}=await supabase.from('rooms').insert(room); if (error) throw error;
        const f=document.getElementById('creator-feedback'); if (f) f.textContent='تم حفظ إعدادات البث كطلب. البث الفعلي لن يبدأ حتى يتم ربط مزوّد البث وإعداداته الآمنة.';
        button.disabled=false; button.textContent='تم حفظ إعدادات البث';
      } catch (error) { const f=document.getElementById('creator-feedback'); if (f) f.textContent='تعذر حفظ إعدادات البث. تحقق من الاتصال والصلاحيات.'; console.error('XLive creator live setup error',error); button.disabled=false; button.textContent='حفظ إعدادات البث'; }
      return;
    }
    if (event.target.id === 'room-create-form') {
      event.preventDefault();
      const supabase = ensureClient(); await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const button = document.getElementById('room-create-submit'); button.disabled = true; button.textContent = 'جارٍ الإرسال…';
      const room = {host_id:user.id,title:document.getElementById('room-title').value.trim(),description:document.getElementById('room-description').value.trim(),media_mode:document.getElementById('room-mode').value,visibility:document.getElementById('room-visibility').value,capacity:Number(document.getElementById('room-capacity').value),status:'pending'};
      const {error} = await supabase.from('rooms').insert(room);
      if (error) { messageSocial('تعذر إرسال طلب الغرفة. تحقق من الحقول والصلاحيات.'); console.error('XLive room create error',error); button.disabled=false; button.textContent='إرسال طلب الغرفة'; return; }
      await renderRooms(); messageSocial('تم حفظ طلب الغرفة. لا يمكن بدء البث حتى إعداد مزوّد الاتصال.'); return;
    }
    if (event.target.id === 'video-upload-form') {
      event.preventDefault();
      const supabase = ensureClient();
      await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const title = document.getElementById('video-title')?.value.trim();
      const description = document.getElementById('video-description')?.value.trim() || '';
      const file = document.getElementById('video-file')?.files?.[0];
      const allowed = {'video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
      if (!title || title.length > 120 || description.length > 2000) { messageSocial('تحقق من العنوان والوصف.'); return; }
      if (!file || !allowed[file.type]) { messageSocial('اختر فيديو بصيغة MP4 أو WebM أو MOV.'); return; }
      if (file.size > 50 * 1024 * 1024) { messageSocial('حجم الملف يتجاوز الحد الأقصى وهو 50 ميغابايت.'); return; }
      const button = document.getElementById('video-upload-submit');
      button.disabled = true; button.textContent = 'جارٍ الرفع…';
      let path = '';
      try {
        const id = window.crypto?.randomUUID?.();
        if (!id) throw new Error('Secure random IDs are not available');
        path = user.id + '/' + id + '.' + allowed[file.type];
        const {error: uploadError} = await supabase.storage.from('video-originals').upload(path,file,{contentType:file.type,upsert:false,cacheControl:'3600'});
        if (uploadError) throw uploadError;
        const {error: rowError} = await supabase.from('videos').insert({owner_id:user.id,title,description,storage_path:path,status:'pending',visibility:'public',is_paid:false});
        if (rowError) {
          await supabase.storage.from('video-originals').remove([path]);
          throw rowError;
        }
        document.getElementById('video-upload-form').reset();
        messageSocial('تم رفع الفيديو إلى التخزين الخاص وإرساله للمراجعة. لن يظهر للعامة قبل الموافقة.');
      } catch (error) {
        messageSocial('تعذر رفع الفيديو. تحقق من الاتصال والصلاحيات وحجم الملف ثم حاول مجدداً.');
        console.error('XLive upload error',error);
      } finally {
        if (document.getElementById('video-upload-submit')) { button.disabled = false; button.textContent = 'رفع وإرسال للمراجعة'; }
      }
      return;
    }
    if (event.target.id === 'message-send-form') {
      event.preventDefault();
      const supabase = ensureClient();
      await syncCurrentUser(supabase);
      if (!supabase || !user) { messageSocial('سجّل الدخول أولاً.'); return; }
      const form = event.target;
      const body = document.getElementById('message-body')?.value.trim();
      if (!body) return;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      const {error} = await supabase.from('messages').insert({sender_id:user.id,recipient_id:form.dataset.recipientId,body});
      if (error) { messageSocial('تعذر إرسال الرسالة. تحقق من وجود متابعة بين الحسابين وعدم وجود حظر.'); console.error('XLive send message error',error); submit.disabled = false; return; }
      await renderMessages(form.dataset.recipientId);
      return;
    }
    if (event.target.id !== 'auth-form') return;
    event.preventDefault();
    const supabase = ensureClient();
    if (!supabase) { feedback('خدمة الحسابات غير مهيأة. تحقق من إعدادات Supabase.'); return; }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const submit = document.getElementById('auth-submit');
    if (mode === 'signup' && !document.getElementById('auth-age').checked) { feedback('يجب تأكيد أن عمرك 18 عاماً أو أكثر.'); return; }
    const phoneInput = document.getElementById('auth-phone');
    const localPhone = phoneInput ? phoneInput.value.replace(/[٠-٩۰-۹]/g, digit => { const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit); return String(arabic >= 0 ? arabic : '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)); }).replace(/\D/g, '') : '';
    const phoneNumber = localPhone.length === 10 && /^09\d{8}$/.test(localPhone) ? '+963' + localPhone.slice(1) : '';
    if (mode === 'signup' && !phoneNumber) { feedback('أدخل رقم جوال سوري صحيحًا من 10 أرقام يبدأ بـ 09.'); phoneInput?.focus(); return; }
    submit.disabled = true;
    submit.textContent = 'جارٍ التنفيذ…';
    feedback('');
    try {
      if (mode === 'signup') {
        const displayName = document.getElementById('auth-name').value.trim();
        const {data,error} = await supabase.auth.signUp({email,password,options:{data:{display_name:displayName,age_confirmed:true,phone_number:phoneNumber}}});
        if (error) throw error;
        if (data.session) { user = data.session.user; await showAccountApprovalState(supabase, true); } else { feedback('تم إنشاء الحساب. إذا طُلب منك تأكيد البريد، أكّده ثم سجّل الدخول؛ سيبقى الحساب بانتظار موافقة الإدارة.'); }
      } else {
        const {data,error} = await supabase.auth.signInWithPassword({email,password});
        if (error) throw error;
        user = data.user;
        await showAccountApprovalState(supabase, false);
      }
    } catch (error) {
      const message = String(error?.message || '');
      feedback(/invalid login credentials/i.test(message) ? 'البريد أو كلمة المرور غير صحيحة.' : /already registered|user already/i.test(message) ? 'قد يكون البريد مسجلاً مسبقاً. جرّب تسجيل الدخول.' : 'تعذر إكمال الطلب. تحقق من الإعدادات وحاول مجدداً.');
      console.error('XLive authentication error', error);
    } finally {
      if (document.getElementById('auth-submit')) { submit.disabled = false; submit.textContent = mode === 'signup' ? 'إنشاء حساب' : 'تسجيل الدخول'; }
    }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-view="profile"]')) setTimeout(renderProfile, 0);
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'profile-form') return;
    event.preventDefault();
    const supabase = ensureClient();
    if (!supabase || !user) { feedback('سجّل الدخول أولاً.'); return; }
    const button = document.getElementById('profile-save');
    if (button?.dataset.editing !== 'true') return;
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    const values = {
      display_name: document.getElementById('profile-display-name').value.trim(),
      bio: document.getElementById('profile-bio').value.trim(),
      is_private: document.getElementById('profile-private').checked
    };
    let saveSucceeded = false;
    try {
      const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
      if (error) throw error;
      saveSucceeded = true;
      feedback('تم حفظ الملف الشخصي.');
    } catch (error) {
      feedback('تعذر حفظ الملف. تأكد من اتصال قاعدة البيانات وحاول مجدداً.');
      console.error('XLive profile update error', error);
    } finally {
      button.disabled = false;
      if (saveSucceeded) {
        ['profile-display-name','profile-bio','profile-private'].forEach(id => { const field = document.getElementById(id); if (field) field.disabled = true; });
        button.dataset.editing = 'false';
        button.type = 'button';
        button.textContent = 'تعديل';
      } else {
        button.type = 'button';
        button.textContent = 'حفظ التغييرات';
      }
    }
  });

  function messageSocial(text) {
    const node = document.getElementById('social-feedback');
    if (node) node.textContent = text;
    else {
      const feedbackNode = document.getElementById('auth-feedback');
      if (feedbackNode) feedbackNode.textContent = text;
      else window.alert(text);
    }
  }
  async function renderSearch(term) {
    const panel = document.getElementById('account-search-results');
    if (!panel) return;
    if (String(term || '').trim().length < 3) {
      panel.innerHTML = '<p class="field-help">اكتب ثلاثة أحرف على الأقل للبحث عن الحسابات.</p>';
      return;
    }
    const supabase = ensureClient();
    if (!supabase) {
      panel.innerHTML = '<p class="field-help">خدمة الحسابات غير مهيأة بعد.</p>';
      return;
    }
    await syncCurrentUser(supabase);
    if (!user) {
      panel.innerHTML = '<p class="field-help">سجّل الدخول أولاً للبحث عن الحسابات وإرسال طلبات المتابعة.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button>';
      return;
    }
    panel.innerHTML = '<p class="field-help">جارٍ البحث…</p>';
    try {
      const {data, error} = await supabase.rpc('search_profiles', {search_term: String(term).trim()});
      if (error) throw error;
      if (!data?.length) {
        panel.innerHTML = '<p class="field-help">لا توجد حسابات مطابقة.</p>';
        return;
      }
      const current = user?.id;
      const [{data: follows}, {data: followers}, {data: requests}, {data: blocks}] = await Promise.all([
        current ? supabase.from('follows').select('followed_id').eq('follower_id', current) : Promise.resolve({data: []}),
        current ? supabase.from('follows').select('follower_id').eq('followed_id', current) : Promise.resolve({data: []}),
        current ? supabase.from('follow_requests').select('target_id,status').eq('requester_id', current) : Promise.resolve({data: []}),
        current ? supabase.from('user_blocks').select('blocked_id').eq('blocker_id', current) : Promise.resolve({data: []})
      ]);
      const following = new Set((follows || []).map(x => x.followed_id));
      const followsBack = new Set((followers || []).map(x => x.follower_id));
      const requested = new Map((requests || []).filter(x => x.status === 'pending').map(x => [x.target_id, x.status]));
      const blocked = new Set((blocks || []).map(x => x.blocked_id));
      panel.innerHTML = data.map(p => {
        const name = escapeHtml(p.display_name || p.username);
        const handle = escapeHtml(p.username);
        let action = '';
        if (!current) action = '<span class="field-help">سجّل الدخول للمتابعة أو الحظر.</span>';
        else if (current === p.id) action = '<span class="field-help">هذا حسابك</span>';
        else if (blocked.has(p.id)) action = '<button class="button button-secondary" data-social-action="unblock" data-user-id="' + p.id + '">إلغاء الحظر</button>';
        else if (following.has(p.id)) action = '<button class="button button-secondary" data-social-action="unfollow" data-user-id="' + p.id + '">إلغاء المتابعة</button>';
        else if (requested.get(p.id) === 'pending') action = '<span class="field-help">طلب المتابعة قيد الانتظار</span><button class="button button-secondary" data-social-action="cancel-request" data-user-id="' + p.id + '">إلغاء الطلب</button>';
        else action = '<button class="button button-primary" data-social-action="' + (p.is_private ? 'request' : 'follow') + '" data-user-id="' + p.id + '">' + (p.is_private ? 'طلب متابعة' : 'متابعة') + '</button>';
        return '<article class="social-user"><div><strong>' + name + '</strong><p>@' + handle + (p.is_private ? ' · حساب خاص' : ' · حساب عام') + '</p></div><div class="social-actions">' + (current && current !== p.id ? '<button class="button button-secondary" data-social-action="view-profile" data-user-id="' + p.id + '">عرض الملف</button>' : '') + action + (current && current !== p.id && (following.has(p.id) || followsBack.has(p.id)) ? '<button class="button button-secondary" data-social-action="message" data-user-id="' + p.id + '">رسالة</button>' : '') + (current && current !== p.id && !blocked.has(p.id) ? '<button class="button button-danger" data-social-action="block" data-user-id="' + p.id + '">حظر</button>' : '') + (current && current !== p.id ? '<button class="button button-secondary" data-social-action="report-profile" data-user-id="' + p.id + '">إبلاغ</button>' : '') + '</div></article>';
      }).join('');
      panel.insertAdjacentHTML('beforeend', '<p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>');
    } catch (error) {
      panel.innerHTML = '<p class="field-help">تعذر البحث عن الحسابات. تأكد من تطبيق آخر ترحيلات قاعدة البيانات.</p>';
      console.error('XLive account search error', error);
    }
  }
  async function renderSocialInbox() {
    const supabase = ensureClient();
    if (!supabase) return;
    await syncCurrentUser(supabase);
    if (!user) return;
    const requestsPanel = document.getElementById('follow-requests-panel');
    const blocksPanel = document.getElementById('blocked-accounts-panel');
    try {
      const {data: requests, error} = await supabase.from('follow_requests').select('requester_id,created_at').eq('target_id', user.id).eq('status', 'pending').order('created_at', {ascending:false});
      if (error) throw error;
      if (requestsPanel) {
        if (!requests?.length) requestsPanel.innerHTML = '<p class="field-help">لا توجد طلبات معلّقة.</p>';
        else {
          const ids = requests.map(r => r.requester_id);
          const {data: profiles} = await supabase.from('profiles').select('id,username,display_name').in('id', ids);
          const byId = new Map((profiles || []).map(p => [p.id,p]));
          requestsPanel.innerHTML = requests.map(r => {
            const p = byId.get(r.requester_id);
            return '<article class="social-user"><div><strong>' + escapeHtml(p?.display_name || p?.username || ('حساب ' + r.requester_id.slice(0,8))) + '</strong><p>' + (p?.username ? '@' + escapeHtml(p.username) + ' · ' : '') + 'طلب متابعة</p></div><div class="social-actions"><button class="button button-primary" data-social-action="accept" data-user-id="' + r.requester_id + '">قبول</button><button class="button button-secondary" data-social-action="reject" data-user-id="' + r.requester_id + '">رفض</button></div></article>';
          }).join('');

        }
      }
      const {data: blocks, error: blockError} = await supabase.from('user_blocks').select('blocked_id').eq('blocker_id', user.id);
      if (blockError) throw blockError;
      if (blocksPanel) {
        if (!blocks?.length) blocksPanel.innerHTML = '<p class="field-help">لا توجد حسابات محظورة.</p>';
        else blocksPanel.innerHTML = blocks.map(b => '<article class="social-user"><div><strong>حساب محظور</strong><p>' + b.blocked_id.slice(0,8) + '</p></div><button class="button button-secondary" data-social-action="unblock" data-user-id="' + b.blocked_id + '">إلغاء الحظر</button></article>').join('');
      }
    } catch (error) {
      if (requestsPanel) requestsPanel.innerHTML = '<p class="field-help">تعذر تحميل الطلبات.</p>';
      if (blocksPanel) blocksPanel.innerHTML = '<p class="field-help">تعذر تحميل قائمة الحظر.</p>';
      console.error('XLive social inbox error', error);
    }
  }



  async function renderRooms() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>الغرف التفاعلية</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    try {
      const {data, error} = await supabase.from('rooms').select('id,host_id,title,description,media_mode,visibility,status,capacity,created_at').order('created_at',{ascending:false}).limit(60);
      if (error) throw error;
      const rooms = data || [];
      const cards = rooms.map(r => {
        const status = r.status === 'pending' ? 'بانتظار المراجعة' : r.status === 'cancelled' ? 'ملغاة' : r.status === 'ended' ? 'انتهت' : 'حالة مباشرة مسجلة';
        const canCancel = user?.id === r.host_id && r.status === 'pending';
        const mode = r.media_mode === 'audio' ? 'صوتية' : 'مرئية';
        return '<article class="room-card"><div class="clip-card-heading"><strong>' + escapeHtml(r.title) + '</strong><span class="status-pill">' + status + '</span></div><p>' + escapeHtml(r.description || '') + '</p><div class="room-meta"><span>' + mode + '</span><span>' + (r.visibility === 'private' ? 'خاصة' : 'عامة') + '</span><span>السعة ' + r.capacity + '</span></div><p class="field-help">البث الصوتي/المرئي غير متصل بمزوّد بعد؛ هذه الغرفة طلب محفوظ فقط.</p>' + (canCancel ? '<button class="button button-secondary" data-social-action="cancel-room" data-room-id="' + r.id + '">إلغاء الطلب</button>' : '') + '</article>';
      }).join('');
      const form = user ? '<form id="room-create-form" class="simple-panel form-stack"><h2>طلب إنشاء غرفة</h2><div class="field"><label for="room-title">اسم الغرفة</label><input id="room-title" maxlength="120" required placeholder="عنوان الغرفة"></div><div class="field"><label for="room-description">الوصف</label><textarea id="room-description" maxlength="1000" rows="2" placeholder="ما موضوع الغرفة؟"></textarea></div><div class="field"><label for="room-mode">نوع الغرفة</label><select id="room-mode"><option value="audio">صوتية</option><option value="video">مرئية</option></select></div><div class="field"><label for="room-visibility">الخصوصية</label><select id="room-visibility"><option value="public">عامة</option><option value="private">خاصة</option></select></div><div class="field"><label for="room-capacity">عدد المشاركين</label><select id="room-capacity"><option value="2">2</option><option value="4">4</option><option value="8" selected>8</option><option value="12">12</option><option value="25">25</option><option value="50">50</option></select></div><button class="button button-primary" id="room-create-submit" type="submit">إرسال طلب الغرفة</button><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form>' : '<div class="simple-panel"><p>سجّل الدخول لإرسال طلب إنشاء غرفة.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / ROOMS</p><h1>الغرف التفاعلية</h1><p>طلبات الغرف تُحفظ، لكن الاتصال الصوتي/المرئي يحتاج مزوّد بث وإعدادات خادم.</p></div></div>' + form + '<div class="room-grid">' + (cards || '<p class="field-help">لا توجد غرف بعد.</p>') + '</div>';
    } catch (error) {
      root.innerHTML = '<div class="view-header"><h1>الغرف التفاعلية</h1></div><div class="simple-panel"><p>تعذر تحميل الغرف.</p></div>';
      console.error('XLive rooms error',error);
    }
  }
  async function renderLive() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>البث المباشر</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    const {data, error} = await supabase.from('rooms').select('id,title,description,media_mode,capacity,created_at').eq('status','live').eq('visibility','public').order('created_at',{ascending:false}).limit(40);
    if (error) {
      root.innerHTML = '<div class="view-header"><h1>البث المباشر</h1></div><div class="simple-panel"><p>تعذر تحميل البثوث.</p></div>';
      return;
    }
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / LIVE</p><h1>البث المباشر</h1><p>لم يتم توصيل مزوّد الصوت/الفيديو أو إصدار رموز الدخول بعد.</p></div><button class="button button-primary" data-view="rooms">طلب غرفة</button></div><div class="notice-panel"><div><strong>البث غير متاح للانضمام حالياً</strong><p>لن نعرض زر اتصال غير عامل. يمكن تجهيز طلب غرفة من قسم الغرف.</p></div></div><div class="room-grid">' + ((data || []).length ? data.map(r => '<article class="room-card"><strong>' + escapeHtml(r.title) + '</strong><p>' + escapeHtml(r.description || '') + '</p><p class="field-help">حالة مباشرة في قاعدة البيانات، لكن خدمة الاتصال غير مهيأة.</p></article>').join('') : '<p class="field-help">لا توجد غرف معلنة حالياً.</p>') + '</div>';
  }
  async function renderSettings() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>الإعدادات</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    if (!user) {
      root.innerHTML = '<div class="view-header"><h1>الإعدادات</h1></div><div class="simple-panel"><p>سجّل الدخول لإدارة الحساب والإبلاغات.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    const admin = user.app_metadata?.role === 'admin';
    const {data: reports, error} = await supabase.from('reports').select('id,reporter_id,target_type,target_id,reason,details,status,created_at,moderator_note').order('created_at',{ascending:false}).limit(100);
    const reportList = error ? '<p class="field-help">تعذر تحميل البلاغات.</p>' : (reports || []).length ? reports.map(r => '<article class="report-card"><div class="clip-card-heading"><strong>' + escapeHtml(r.reason) + '</strong><span class="status-pill">' + escapeHtml(r.status) + '</span></div><p>' + escapeHtml(r.details || '') + '</p><small>' + escapeHtml(r.target_type) + ' · ' + r.target_id.slice(0,8) + ' · ' + shortDate(r.created_at) + '</small>' + (r.moderator_note ? '<p class="field-help">' + escapeHtml(r.moderator_note) + '</p>' : '') + (admin && ['open','reviewing'].includes(r.status) ? '<div class="social-actions"><button class="button button-secondary" data-social-action="review-report" data-report-id="' + r.id + '">قيد المراجعة</button><button class="button button-primary" data-social-action="resolve-report" data-report-id="' + r.id + '">حل البلاغ</button><button class="button button-danger" data-social-action="dismiss-report" data-report-id="' + r.id + '">إغلاق بلا إجراء</button></div>' : '') + '</article>').join('') : '<p class="field-help">لا توجد بلاغات.</p>';
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / SETTINGS</p><h1>الإعدادات والأمان</h1><p>إدارة البلاغات والحسابات.</p></div><button class="back-home" data-view="profile">الملف الشخصي ←</button></div><div class="simple-panel"><h2>الخصوصية</h2><p>تغيير خصوصية الحساب متاح من صفحة الملف الشخصي. الحظر يوقف الرسائل ويحذف المتابعات وطلبات المتابعة بين الطرفين.</p><button class="button button-secondary" data-view="profile">إعدادات الملف الشخصي</button></div><section class="simple-panel report-inbox"><h2>' + (admin ? 'لوحة مراجعة البلاغات' : 'بلاغاتي') + '</h2>' + reportList + '</section><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>';
  }


  async function renderSaved() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>المحفوظات</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    if (!user) {
      root.innerHTML = '<div class="view-header"><h1>المحفوظات</h1></div><div class="simple-panel"><p>سجّل الدخول لمشاهدة الفيديوهات المحفوظة.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    try {
      const {data: saved, error} = await supabase.from('saved_videos').select('video_id,created_at').eq('user_id',user.id).order('created_at',{ascending:false}).limit(100);
      if (error) throw error;
      const ids = (saved || []).map(x => x.video_id);
      const {data: videos, error: videoError} = ids.length ? await supabase.from('videos').select('id,title,description,storage_path,created_at').in('id',ids) : {data:[],error:null};
      if (videoError) throw videoError;
      const visible = videos || [];
      const cards = await Promise.all(visible.map(async v => {
        const {data: signed} = await supabase.storage.from('video-originals').createSignedUrl(v.storage_path,3600);
        return '<article class="clip-card">' + (signed?.signedUrl ? '<video class="clip-player" controls playsinline preload="metadata" src="' + escapeHtml(signed.signedUrl) + '"></video>' : '<div class="clip-placeholder">الفيديو غير متاح</div>') + '<div class="clip-card-body"><strong>' + escapeHtml(v.title) + '</strong><p>' + escapeHtml(v.description || '') + '</p><button class="button button-secondary" data-social-action="remove-saved-video" data-video-id="' + v.id + '">إزالة من المحفوظات</button></div></article>';
      }));
      root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / SAVED</p><h1>المحفوظات</h1><p>الفيديوهات العامة المقبولة فقط تظهر هنا.</p></div><button class="back-home" data-view="clips">العودة للمقاطع ←</button></div><div id="saved-video-list" class="clip-grid">' + (cards.length ? cards.join('') : '<div class="empty-panel"><h3>لا توجد فيديوهات محفوظة متاحة</h3><p>' + (ids.length ? 'قد تكون بعض الفيديوهات أُزيلت أو لم تعد متاحة.' : 'احفظ فيديو عاماً من صفحة المقاطع ليظهر هنا.') + '</p></div>') + '</div><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>';
    } catch (error) {
      root.innerHTML = '<div class="view-header"><h1>المحفوظات</h1></div><div class="simple-panel"><p>تعذر تحميل المحفوظات.</p></div>';
      console.error('XLive saved videos error',error);
    }
  }

  async function renderUpload() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>رفع فيديو</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    if (!user) {
      root.innerHTML = '<div class="view-header"><h1>رفع فيديو</h1><p>انشر مقاطعك بعد المراجعة.</p></div><div class="simple-panel"><p>سجّل الدخول لرفع الفيديو.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / UPLOAD</p><h1>رفع فيديو</h1><p>يُخزن الفيديو بشكل خاص ويبقى قيد المراجعة حتى الموافقة.</p></div><button class="back-home" data-view="clips">العودة للمقاطع ←</button></div><div class="notice-panel"><span class="notice-icon">ⓘ</span><div><strong>حدود الرفع</strong><p>MP4 أو WebM أو MOV، بحد أقصى 50 ميغابايت. لا يصبح الفيديو عاماً قبل الموافقة، ولا تدعم هذه الواجهة المدفوعات أو تحويل الفيديو.</p></div></div><form id="video-upload-form" class="simple-panel form-stack"><div class="field"><label for="video-title">عنوان الفيديو</label><input id="video-title" maxlength="120" required placeholder="عنوان واضح للمقطع"></div><div class="field"><label for="video-description">الوصف (اختياري)</label><textarea id="video-description" maxlength="2000" rows="3" placeholder="أضف تفاصيل عن المقطع"></textarea></div><div class="field"><label for="video-file">ملف الفيديو</label><input id="video-file" type="file" accept="video/mp4,video/webm,video/quicktime" required><p class="field-help">الحد الأقصى 50 ميغابايت. لا ترفع محتوى لا تملك حق نشره أو يخالف إرشادات المنصة.</p></div><button class="button button-primary" id="video-upload-submit" type="submit">رفع وإرسال للمراجعة</button><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form>';
  }

  let homeFeedPage = 1;
  async function renderHomeFeed(page = homeFeedPage) {
    const panel = document.getElementById('home-feed');
    if (!panel) return;
    homeFeedPage = Math.max(1, Number(page) || 1);
    const pager = document.getElementById('home-pagination');
    const supabase = ensureClient();
    if (!supabase) {
      panel.innerHTML = '<div class="empty-panel"><h3>الخدمة غير مهيأة</h3><p>تحقق من إعدادات قاعدة البيانات.</p></div>';
      if (pager) pager.innerHTML = '';
      return;
    }
    await syncCurrentUser(supabase);
    try {
      const pageSize = 16;
      const from = (homeFeedPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const {data, error, count} = await supabase.from('videos').select('id,title,description,storage_path,created_at',{count:'exact'}).eq('status','approved').eq('is_paid',false).eq('visibility','public').order('created_at',{ascending:false}).range(from,to);
      if (error) throw error;
      const videos = data || [];
      if (!videos.length && homeFeedPage > 1) { homeFeedPage = 1; return renderHomeFeed(1); }
      if (!videos.length) {
        panel.className = 'home-feed-grid';
        panel.innerHTML = '<div class="empty-panel home-feed-empty"><div class="empty-symbol">✦</div><h3>لا توجد مقاطع عامة بعد</h3><p>ستظهر هنا المقاطع التي ينشرها المستخدمون للعامة بعد اجتياز المراجعة.</p><span class="status-pill"><span class="status-dot"></span> بانتظار نشر أول فيديو مقبول</span></div>';
      } else {
        const cards = await Promise.all(videos.map(async v => {
          const {data: signed} = await supabase.storage.from('video-originals').createSignedUrl(v.storage_path,3600);
          return '<article class="home-clip-card">' + (signed?.signedUrl ? '<video controls playsinline preload="metadata" src="' + escapeHtml(signed.signedUrl) + '" aria-label="' + escapeHtml(v.title) + '"></video>' : '<div class="clip-placeholder">الفيديو غير متاح</div>') + '<div><strong>' + escapeHtml(v.title) + '</strong>' + (v.description ? '<p>' + escapeHtml(v.description) + '</p>' : '') + '</div></article>';
        }));
        panel.className = 'home-feed-grid';
        panel.innerHTML = cards.join('');
      }
      const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize));
      if (pager) {
        if (totalPages <= 1) pager.innerHTML = '';
        else {
          const pages = [];
          const first = Math.max(1, Math.min(homeFeedPage - 2, totalPages - 4));
          const last = Math.min(totalPages, Math.max(5, homeFeedPage + 2));
          for (let p = first; p <= last; p++) pages.push('<button type="button" class="home-page-number ' + (p === homeFeedPage ? 'active' : '') + '" data-feed-page="' + p + '" aria-current="' + (p === homeFeedPage ? 'page' : 'false') + '">' + p + '</button>');
          pager.innerHTML = '<button type="button" class="home-page-arrow" data-feed-page="' + Math.max(1,homeFeedPage-1) + '" aria-label="الصفحة السابقة" ' + (homeFeedPage === 1 ? 'disabled' : '') + '>‹</button>' + pages.join('') + '<button type="button" class="home-page-arrow" data-feed-page="' + Math.min(totalPages,homeFeedPage+1) + '" aria-label="الصفحة التالية" ' + (homeFeedPage === totalPages ? 'disabled' : '') + '>›</button>';
        }
      }
    } catch (error) {
      panel.innerHTML = '<div class="empty-panel"><h3>تعذر تحميل المقاطع</h3><p>تحقق من اتصال قاعدة البيانات ثم حاول مجدداً.</p></div>';
      if (pager) pager.innerHTML = '';
      console.error('XLive home feed error',error);
    }
  }
  document.addEventListener('click', event => {
    const pageButton = event.target.closest('[data-feed-page]');
    if (!pageButton || pageButton.disabled) return;
    event.preventDefault();
    renderHomeFeed(Number(pageButton.dataset.feedPage));
  });

  let clipsPage = 1;
  async function renderClips(page = clipsPage) {
    const supabase = ensureClient();
    const panel = document.getElementById('clips-feed');
    if (!panel) return;
    clipsPage = Math.max(1, Number(page) || 1);
    let pager = document.getElementById('clips-pagination');
    if (!pager) {
      panel.insertAdjacentHTML('afterend', '<nav id="clips-pagination" class="home-pagination" aria-label="صفحات المقاطع"></nav>');
      pager = document.getElementById('clips-pagination');
    }
    if (!supabase) {
      panel.innerHTML = '<div class="empty-panel"><h3>المقاطع غير متاحة حالياً</h3><p>تعذر الاتصال بخدمة المقاطع. حاول مجدداً لاحقاً.</p></div>';
      if (pager) pager.innerHTML = '';
      return;
    }
    try {
      const pageSize = 16;
      const to = clipsPage * pageSize - 1;
      const [hostedResult, externalResult] = await Promise.all([
        supabase.from('videos').select('id,title,description,storage_path,created_at',{count:'exact'})
          .eq('status','approved').eq('visibility','public').eq('is_paid',false)
          .order('created_at',{ascending:false}).range(0,to),
        supabase.from('external_video_links').select('id,title,description,source_url,embed_url,created_at',{count:'exact'})
          .eq('status','approved').order('created_at',{ascending:false}).range(0,to)
      ]);
      if (hostedResult.error) throw hostedResult.error;
      const hosted = (hostedResult.data || []).map(v => ({...v, _kind:'hosted'}));
      const external = externalResult.error ? [] : (externalResult.data || []).map(v => ({...v, _kind:'external'}));
      const totalCount = Number(hostedResult.count || 0) + Number(externalResult.count || 0);
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      if (clipsPage > totalPages) return renderClips(totalPages);
      const items = hosted.concat(external).sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const visible = items.slice((clipsPage - 1) * pageSize, clipsPage * pageSize);
      const cards = await Promise.all(visible.map(async v => {
        if (v._kind === 'hosted') {
          const {data: signed} = await supabase.storage.from('video-originals').createSignedUrl(v.storage_path, 3600);
          const media = signed?.signedUrl
            ? '<video class="clip-player" controls playsinline preload="metadata" src="' + escapeHtml(signed.signedUrl) + '" aria-label="' + escapeHtml(v.title) + '"></video>'
            : '<div class="clip-placeholder">الفيديو غير متاح للعرض حالياً</div>';
          return '<article class="clip-card clips-gallery-card">' + media + '<div class="clip-card-body"><strong><span class="clip-title-marquee">' + escapeHtml(v.title) + '</span></strong>' + (v.description ? '<p>' + escapeHtml(v.description) + '</p>' : '') + '<small>' + shortDate(v.created_at) + '</small></div></article>';
        }
        const media = '<div class="external-embed-wrap"><iframe class="external-clip-player" src="' + escapeHtml(v.embed_url) + '" title="' + escapeHtml(v.title) + '" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" allowfullscreen></iframe></div>';
        return '<article class="clip-card external-clip-card clips-gallery-card">' + media + '<div class="clip-card-body"><strong><span class="clip-title-marquee">' + escapeHtml(v.title) + '</span></strong>' + (v.description ? '<p>' + escapeHtml(v.description) + '</p>' : '') + '<small>' + shortDate(v.created_at) + '</small></div></article>';
      }));
      panel.className = 'clip-grid clips-gallery-grid';
      panel.innerHTML = cards.length ? cards.join('') : '<div class="empty-panel clips-gallery-empty"><h3>لا توجد مقاطع منشورة بعد</h3><p>ستظهر هنا المقاطع العامة المقبولة وروابط الفيديوهات التي تمت الموافقة على تضمينها.</p></div>';
      if (pager) {
        if (totalPages <= 1) pager.innerHTML = '';
        else {
          const first = Math.max(1, Math.min(clipsPage - 2, totalPages - 4));
          const last = Math.min(totalPages, Math.max(5, clipsPage + 2));
          const pages = [];
          for (let p = first; p <= last; p++) pages.push('<button type="button" class="home-page-number ' + (p === clipsPage ? 'active' : '') + '" data-clips-page="' + p + '" aria-current="' + (p === clipsPage ? 'page' : 'false') + '">' + p + '</button>');
          pager.innerHTML = '<button type="button" class="home-page-arrow" data-clips-page="' + Math.max(1,clipsPage-1) + '" aria-label="الصفحة السابقة" ' + (clipsPage === 1 ? 'disabled' : '') + '>‹</button>' + pages.join('') + '<button type="button" class="home-page-arrow" data-clips-page="' + Math.min(totalPages,clipsPage+1) + '" aria-label="الصفحة التالية" ' + (clipsPage === totalPages ? 'disabled' : '') + '>›</button>';
        }
      }
    } catch (error) {
      panel.innerHTML = '<div class="empty-panel"><h3>تعذر تحميل المقاطع</h3><p>تحقق من الاتصال ثم حاول مجدداً.</p></div>';
      if (pager) pager.innerHTML = '';
      console.error('XLive clips error', error);
    }
  }
  document.addEventListener('click', event => {
    const pageButton = event.target.closest('[data-clips-page]');
    if (!pageButton || pageButton.disabled) return;
    event.preventDefault();
    renderClips(Number(pageButton.dataset.clipsPage));
  });

  function shortDate(value) {
    try { return new Date(value).toLocaleString('ar', {dateStyle:'short',timeStyle:'short'}); }
    catch (_) { return ''; }
  }
  async function renderMessages(targetId) {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>الرسائل الخاصة</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    if (!user) {
      root.innerHTML = '<div class="view-header"><h1>الرسائل الخاصة</h1><p>تواصل مع الحسابات المرتبطة بك.</p></div><div class="simple-panel"><p>سجّل الدخول لاستخدام الرسائل.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    try {
      const {data: rows, error} = await supabase.from('messages').select('id,sender_id,recipient_id,body,created_at,read_at').or('sender_id.eq.' + user.id + ',recipient_id.eq.' + user.id).order('created_at', {ascending:false}).limit(300);
      if (error) throw error;
      const messages = (rows || []).reverse();
      const latest = new Map();
      messages.forEach(m => {
        const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        const old = latest.get(other);
        if (!old || old.created_at < m.created_at) latest.set(other, m);
      });
      if (!targetId) targetId = activeConversationId || [...latest.entries()].sort((a,b) => b[1].created_at.localeCompare(a[1].created_at))[0]?.[0] || null;
      if (targetId) activeConversationId = targetId;
      const ids = [...new Set([...latest.keys(), ...(targetId ? [targetId] : [])])];
      let profileRows = [];
      if (ids.length) {
        const {data: profiles} = await supabase.from('profiles').select('id,username,display_name').in('id', ids);
        profileRows = profiles || [];
      }
      const profileMap = new Map(profileRows.map(p => [p.id,p]));
      const nameFor = id => {
        const p = profileMap.get(id);
        return escapeHtml(p?.display_name || (p?.username ? '@' + p.username : 'حساب ' + id.slice(0,8)));
      };
      let activeMessages = targetId ? messages.filter(m => (m.sender_id === user.id && m.recipient_id === targetId) || (m.sender_id === targetId && m.recipient_id === user.id)) : [];
      const incomingIds = activeMessages.filter(m => m.recipient_id === user.id && !m.read_at).map(m => m.id);
      if (incomingIds.length) {
        const {error: readError} = await supabase.from('messages').update({read_at:new Date().toISOString()}).in('id', incomingIds);
        if (!readError) activeMessages = activeMessages.map(m => incomingIds.includes(m.id) ? {...m,read_at:new Date().toISOString()} : m);
      }
      let connected = false;
      if (targetId) {
        const [outgoing, incoming] = await Promise.all([
          supabase.from('follows').select('follower_id').eq('follower_id',user.id).eq('followed_id',targetId).maybeSingle(),
          supabase.from('follows').select('follower_id').eq('follower_id',targetId).eq('followed_id',user.id).maybeSingle()
        ]);
        connected = !!outgoing.data || !!incoming.data;
      }
      const conversationList = ids.length ? ids.map(id => {
        const last = latest.get(id);
        return '<button type="button" class="conversation-item ' + (id === targetId ? 'active' : '') + '" data-social-action="message" data-user-id="' + id + '"><strong>' + nameFor(id) + '</strong><span>' + escapeHtml(last ? last.body.slice(0,60) : 'ابدأ محادثة جديدة') + '</span>' + (last ? '<small>' + shortDate(last.created_at) + '</small>' : '') + '</button>';
      }).join('') : '<p class="field-help">لا توجد محادثات بعد. ابحث عن حساب تتابعه أو يتابعك لبدء محادثة.</p>';
      const thread = targetId ? '<div class="thread-header"><div><strong>' + nameFor(targetId) + '</strong><p class="field-help">تظهر الرسائل للأطراف فقط. الحظر يمنع الوصول إلى المحادثة.</p></div></div><div class="message-list">' + (activeMessages.length ? activeMessages.map(m => '<article class="message-bubble ' + (m.sender_id === user.id ? 'mine' : 'theirs') + '"><p>' + escapeHtml(m.body) + '</p><small>' + shortDate(m.created_at) + (m.sender_id === user.id && m.read_at ? ' · تمت القراءة' : '') + '</small>' + (m.sender_id !== user.id ? '<button class="text-button" data-social-action="report-message" data-message-id="' + m.id + '">إبلاغ</button>' : '') + '</article>').join('') : '<p class="field-help">لا توجد رسائل في هذه المحادثة بعد.</p>') + '</div>' + (connected ? '<form id="message-send-form" class="message-compose" data-recipient-id="' + targetId + '"><textarea id="message-body" maxlength="5000" rows="2" required placeholder="اكتب رسالتك…"></textarea><button class="button button-primary" type="submit">إرسال</button></form>' : '<p class="field-help">لإرسال الرسائل، يجب أن يتابع أحدكما الآخر وألا يكون هناك حظر.</p>') : '<div class="message-empty"><p>اختر محادثة من القائمة أو ابدأ واحدة من نتائج البحث.</p></div>';
      root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / MESSAGES</p><h1>الرسائل الخاصة</h1><p>محادثات بين الحسابات المرتبطة بالمتابعة.</p></div><button class="back-home" data-view="home">العودة للرئيسية ←</button></div><div class="messages-layout"><aside class="conversation-list"><h2>المحادثات</h2>' + conversationList + '</aside><section class="conversation-thread">' + thread + '</section></div><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>';
    } catch (error) {
      root.innerHTML = '<div class="view-header"><h1>الرسائل الخاصة</h1></div><div class="simple-panel"><p>تعذر تحميل الرسائل. تحقق من تطبيق ترحيل قاعدة البيانات الأخير.</p></div>';
      console.error('XLive messages error', error);
    }
  }
  async function renderNotifications() {
    const supabase = ensureClient();
    if (!supabase) { root.innerHTML = '<div class="view-header"><h1>الإشعارات</h1></div><p class="field-help">خدمة الحسابات غير مهيأة.</p>'; return; }
    await syncCurrentUser(supabase);
    if (!user) {
      root.innerHTML = '<div class="view-header"><h1>الإشعارات</h1></div><div class="simple-panel"><p>سجّل الدخول لمشاهدة الإشعارات.</p><button class="button button-primary" data-view="profile">تسجيل الدخول</button></div>';
      return;
    }
    const {data, error} = await supabase.from('notifications').select('id,actor_id,kind,title,body,target_type,target_id,read_at,created_at').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(100);
    if (error) {
      root.innerHTML = '<div class="view-header"><h1>الإشعارات</h1></div><div class="simple-panel"><p>تعذر تحميل الإشعارات.</p></div>';
      console.error('XLive notifications error',error);
      return;
    }
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / ACTIVITY</p><h1>الإشعارات</h1><p>تنبيهات المتابعة والرسائل وطلبات المتابعة.</p></div><button class="back-home" data-view="home">العودة للرئيسية ←</button></div><div class="notification-list">' + ((data || []).length ? data.map(n => '<article class="notification-item ' + (n.read_at ? '' : 'unread') + '"><div><strong>' + escapeHtml(n.title) + '</strong><p>' + escapeHtml(n.body) + '</p><small>' + shortDate(n.created_at) + '</small></div><div class="social-actions">' + (!n.read_at ? '<button class="button button-secondary" data-social-action="mark-notification-read" data-notification-id="' + n.id + '">تمت القراءة</button>' : '') + (n.kind === 'message' && n.actor_id ? '<button class="button button-primary" data-social-action="message" data-user-id="' + n.actor_id + '">فتح المحادثة</button>' : '') + '</div></article>').join('') : '<p class="field-help">لا توجد إشعارات بعد.</p>') + '</div><p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>';
  }

  async function handleSocialAction(action, targetId) {
    const supabase = ensureClient();
    if (!supabase || !user) { messageSocial('سجّل الدخول أولاً لتنفيذ هذا الإجراء.'); return; }
    try {
      if (action === 'view-profile') { window.XLiveApp?.navigate('creator', targetId); return; }
      if (action === 'message') { activeConversationId = targetId; await renderMessages(targetId); return; }
      let result;
      if (action === 'save-video') result = await supabase.from('saved_videos').insert({user_id:user.id,video_id:targetId});
      else if (action === 'remove-saved-video') result = await supabase.from('saved_videos').delete().eq('user_id',user.id).eq('video_id',targetId);
      if (action === 'cancel-room') result = await supabase.from('rooms').update({status:'cancelled'}).eq('id',targetId).eq('host_id',user.id).eq('status','pending');
      else if (action === 'report-video' || action === 'report-profile' || action === 'report-message') result = await supabase.from('reports').insert({reporter_id:user.id,target_type:action === 'report-video' ? 'video' : action === 'report-message' ? 'message' : 'profile',target_id:targetId,reason:action === 'report-video' ? 'محتوى غير مناسب' : action === 'report-message' ? 'رسالة غير مناسبة' : 'سلوك مسيء',details:'تم الإبلاغ من واجهة التطبيق.',status:'open'});
      else if (action === 'review-report' || action === 'resolve-report' || action === 'dismiss-report') {
        const status = action === 'review-report' ? 'reviewing' : action === 'resolve-report' ? 'resolved' : 'dismissed';
        result = await supabase.from('reports').update({status,moderator_id:user.id,moderator_note:status === 'resolved' ? 'تمت مراجعة البلاغ واتخاذ الإجراء المناسب.' : status === 'dismissed' ? 'تمت مراجعة البلاغ وإغلاقه دون إجراء إضافي.' : 'قيد المراجعة.',resolved_at:status === 'reviewing' ? null : new Date().toISOString()}).eq('id',targetId).select('id').maybeSingle();
      }
      if (action === 'approve-video' || action === 'reject-video' || action === 'remove-video') {
        const status = action === 'approve-video' ? 'approved' : action === 'remove-video' ? 'removed' : 'rejected';
        const expectedStatus = action === 'remove-video' ? 'approved' : 'pending';
        result = await supabase.from('videos').update({status,reviewed_by:user.id,reviewed_at:new Date().toISOString(),rejection_reason:status === 'approved' ? null : action === 'remove-video' ? 'تمت إزالة الفيديو بعد المراجعة أو البلاغ.' : 'يرجى مراجعة إرشادات النشر وإعادة المحاولة.'}).eq('id',targetId).eq('status',expectedStatus).select('id').maybeSingle();
        if (!result.data && !result.error) { messageSocial('لم يتم تحديث الفيديو؛ ربما تمت مراجعته مسبقاً.'); return; }
      }
      else if (action === 'mark-notification-read') result = await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',targetId).eq('recipient_id',user.id);
      else if (action === 'follow') result = await supabase.from('follows').insert({follower_id:user.id, followed_id:targetId});
      else if (action === 'unfollow') result = await supabase.from('follows').delete().eq('follower_id',user.id).eq('followed_id',targetId);
      else if (action === 'request') {
        const {data: existing, error: lookupError} = await supabase.from('follow_requests').select('status').eq('requester_id',user.id).eq('target_id',targetId).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing?.status === 'pending') { messageSocial('طلب المتابعة قيد الانتظار بالفعل.'); return; }
        if (existing && existing.status !== 'pending') {
          const {error: deleteError} = await supabase.from('follow_requests').delete().eq('requester_id',user.id).eq('target_id',targetId);
          if (deleteError) throw deleteError;
        }
        if (!existing || existing.status !== 'pending') result = await supabase.from('follow_requests').insert({requester_id:user.id,target_id:targetId,status:'pending'});
      }
      else if (action === 'cancel-request') result = await supabase.from('follow_requests').delete().eq('requester_id',user.id).eq('target_id',targetId);
      else if (action === 'accept' || action === 'reject') result = await supabase.from('follow_requests').update({status:action === 'accept' ? 'accepted' : 'rejected'}).eq('requester_id',targetId).eq('target_id',user.id).eq('status','pending');
      else if (action === 'block') result = await supabase.from('user_blocks').insert({blocker_id:user.id,blocked_id:targetId});
      else if (action === 'unblock') result = await supabase.from('user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',targetId);
      if (result?.error) throw result.error;
      const messages = {follow:'تمت المتابعة.',unfollow:'تم إلغاء المتابعة.',request:'تم إرسال طلب المتابعة.', 'cancel-request':'تم إلغاء طلب المتابعة.',accept:'تم قبول الطلب.',reject:'تم رفض الطلب.',block:'تم حظر الحساب وإزالة علاقات المتابعة.',unblock:'تم إلغاء الحظر.','mark-notification-read':'تم تحديث الإشعار.','approve-video':'تمت الموافقة على الفيديو.','reject-video':'تم رفض الفيديو وإبلاغ صاحبه.','remove-video':'تمت إزالة الفيديو وإبلاغ صاحبه.','save-video':'تم حفظ الفيديو.','remove-saved-video':'تمت إزالة الفيديو من المحفوظات.','cancel-room':'تم إلغاء طلب الغرفة.','report-video':'تم إرسال البلاغ للمراجعة.','report-profile':'تم إرسال البلاغ للمراجعة.','report-message':'تم إرسال البلاغ للمراجعة.','review-report':'تم نقل البلاغ إلى قيد المراجعة.','resolve-report':'تم حل البلاغ.','dismiss-report':'تم إغلاق البلاغ.'};
      const searchTerm = document.getElementById('global-search')?.value.trim();
      if (document.getElementById('account-search-results') && searchTerm && action !== 'report-profile') await renderSearch(searchTerm);
      if (action === 'mark-notification-read') await renderNotifications();
      else if (action === 'save-video' || action === 'approve-video' || action === 'reject-video' || action === 'remove-video' || action === 'report-video') await renderClips();
      else if (action === 'remove-saved-video') {
        if (document.getElementById('saved-video-list')) await renderSaved(); else await renderClips();
      }
      else if (action === 'report-message') await renderMessages(activeConversationId);
      else if (action === 'cancel-room') await renderRooms();
      else if (['review-report','resolve-report','dismiss-report'].includes(action)) await renderSettings();
      else if (action === 'report-profile' && searchTerm) await renderSearch(searchTerm);
      else await renderSocialInbox();
      messageSocial(messages[action] || 'تم تحديث الإجراء.');
    } catch (error) {
      const msg = String(error?.message || '');
      messageSocial(/duplicate key/i.test(msg) ? 'هذا الإجراء موجود مسبقاً.' : 'تعذر تنفيذ الإجراء. قد تكون هناك صلاحيات أو إعدادات ناقصة.');
      console.error('XLive social action error', error);
    }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-social-action]');
    if (!button) return;
    event.preventDefault();
    handleSocialAction(button.dataset.socialAction, button.dataset.userId || button.dataset.notificationId || button.dataset.videoId || button.dataset.roomId || button.dataset.reportId || button.dataset.messageId);
  });

  window.XLiveAuth = { getClient: () => client, render: renderProfile, renderSearch, renderMessages, renderNotifications, renderClips, renderSaved, renderUpload, renderRooms, renderLive, renderSettings, renderHomeFeed, renderCreatorProfile, getUser: () => user, isReady: () => authReady, cleanup: () => { subscription?.unsubscribe(); if (creatorCameraStream) creatorCameraStream.getTracks().forEach(track => track.stop()); } };
  if (window.supabase && config) ensureClient();
  else {
    authReady = true;
    window.XLiveApp?.restoreCurrentRoute();
  }
  if (document.getElementById('home-feed')) renderHomeFeed();
})();