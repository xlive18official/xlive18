(() => {
  'use strict';
  const config = window.XLIVE_SUPABASE;
  const root = document.getElementById('app-view');
  if (!root) return;
  let client = null;
  let mode = 'signin';
  let user = null;
  let subscription = null;

  function feedback(message) {
    const node = document.getElementById('auth-feedback');
    if (node) node.textContent = message;
  }
  function setMode(next) {
    mode = next === 'signup' ? 'signup' : 'signin';
    const name = document.getElementById('auth-name-wrap');
    const age = document.getElementById('auth-age-wrap');
    const submit = document.getElementById('auth-submit');
    const reset = document.getElementById('auth-reset');
    if (name) name.hidden = mode !== 'signup';
    if (age) age.hidden = mode !== 'signup';
    if (submit) submit.textContent = mode === 'signup' ? 'إنشاء حساب' : 'تسجيل الدخول';
    if (reset) reset.hidden = mode !== 'signin';
    feedback('');
  }
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  async function renderProfile() {
    if (!document.querySelector('[data-view].active')?.matches('[data-view="profile"]')) return;
    if (user) {
      let profile = { display_name: '', username: '', bio: '', is_private: false };
      const supabase = ensureClient();
      if (supabase) {
        const { data } = await supabase.from('profiles').select('display_name,username,bio,is_private').eq('id', user.id).maybeSingle();
        if (data) profile = data;
      }
      if (!document.querySelector('[data-view].active')?.matches('[data-view="profile"]') || !user) return;
      root.innerHTML = '<div class="view-header"><div><h1>ملفي الشخصي</h1><p>تعديل بياناتك المحفوظة</p></div></div><div class="simple-panel auth-panel"><p class="eyebrow">الحساب المتصل</p><p>' + escapeHtml(user.email) + '</p><form id="profile-form" class="form-stack"><div class="field"><label for="profile-username">اسم المستخدم</label><input id="profile-username" value="' + escapeHtml(profile.username) + '" disabled><p class="field-help">اسم المستخدم يُنشأ تلقائياً حالياً.</p></div><div class="field"><label for="profile-display-name">الاسم الظاهر</label><input id="profile-display-name" maxlength="60" value="' + escapeHtml(profile.display_name) + '" placeholder="كيف تريد أن تظهر للآخرين؟"></div><div class="field"><label for="profile-bio">نبذة عنك</label><textarea id="profile-bio" maxlength="500" rows="4" placeholder="اكتب نبذة قصيرة">' + escapeHtml(profile.bio) + '</textarea></div><label class="auth-age"><input id="profile-private" type="checkbox" ' + (profile.is_private ? 'checked' : '') + '> جعل حسابي خاصاً</label><button class="button button-primary" id="profile-save" type="submit">حفظ التغييرات</button></form><button class="button button-secondary" id="auth-signout" type="button">تسجيل الخروج</button><p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite"></p></div>';
      root.insertAdjacentHTML('beforeend', '<section class="simple-panel social-inbox"><h2>طلبات المتابعة</h2><div id="follow-requests-panel"><p class="field-help">جارٍ تحميل الطلبات…</p></div><h2>الحسابات المحظورة</h2><div id="blocked-accounts-panel"><p class="field-help">جارٍ تحميل قائمة الحظر…</p></div></section>');
      renderSocialInbox();
      return;
    }
    root.innerHTML = '<div class="view-header"><div><h1>حسابك على XLive 18</h1><p>إنشاء حساب أو تسجيل الدخول</p></div></div><div class="notice-panel"><span class="notice-icon" aria-hidden="true">ⓘ</span><div><strong>للبالغين 18 عاماً أو أكثر</strong><p>قد تحتاج إلى تأكيد بريدك الإلكتروني قبل تسجيل الدخول.</p></div></div><div class="simple-panel auth-panel"><div class="auth-tabs"><button type="button" class="button button-primary" data-auth-mode="signin">تسجيل الدخول</button><button type="button" class="button button-secondary" data-auth-mode="signup">إنشاء حساب</button></div><form id="auth-form" class="form-stack"><div class="field" id="auth-name-wrap" hidden><label for="auth-name">الاسم الظاهر</label><input id="auth-name" maxlength="40" autocomplete="nickname" placeholder="اسم العرض"></div><div class="field"><label for="auth-email">البريد الإلكتروني</label><input id="auth-email" type="email" required autocomplete="email" maxlength="254" placeholder="you@example.com"></div><div class="field"><label for="auth-password">كلمة المرور</label><input id="auth-password" type="password" required minlength="8" maxlength="72" autocomplete="current-password" placeholder="8 أحرف على الأقل"></div><label class="auth-age" id="auth-age-wrap" hidden><input id="auth-age" type="checkbox"> أؤكد أن عمري 18 عاماً أو أكثر.</label><button class="button button-primary" id="auth-submit" type="submit">تسجيل الدخول</button><button class="text-button" id="auth-reset" type="button">نسيت كلمة المرور؟</button><p id="auth-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form></div>';
    setMode(mode);
  }
  function ensureClient() {
    if (client) return client;
    if (!config?.url || !config?.key || !window.supabase?.createClient) return null;
    client = window.supabase.createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    client.auth.getSession().then(({data}) => { user = data?.session?.user || null; renderProfile(); }).catch(() => {});
    const result = client.auth.onAuthStateChange((_event, session) => { user = session?.user || null; renderProfile(); });
    subscription = result?.data?.subscription || null;
    return client;
  }
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-auth-mode],#auth-signout,#auth-reset');
    if (!target) return;
    if (target.matches('[data-auth-mode]')) { setMode(target.dataset.authMode); return; }
    const supabase = ensureClient();
    if (!supabase) { feedback('خدمة الحسابات غير مهيأة بعد.'); return; }
    if (target.id === 'auth-signout') {
      const {error} = await supabase.auth.signOut();
      feedback(error ? 'تعذر تسجيل الخروج، حاول مجدداً.' : 'تم تسجيل الخروج.');
    } else if (target.id === 'auth-reset') {
      const email = document.getElementById('auth-email')?.value.trim();
      if (!email) { feedback('أدخل بريدك الإلكتروني أولاً.'); return; }
      const {error} = await supabase.auth.resetPasswordForEmail(email, {redirectTo: window.location.origin});
      feedback(error ? 'تعذر إرسال تعليمات الاستعادة. تحقق من إعدادات البريد.' : 'إذا كان البريد مسجلاً، فستصلك تعليمات الاستعادة.');
    }
  });
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'auth-form') return;
    event.preventDefault();
    const supabase = ensureClient();
    if (!supabase) { feedback('خدمة الحسابات غير مهيأة. تحقق من إعدادات Supabase.'); return; }
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const submit = document.getElementById('auth-submit');
    if (mode === 'signup' && !document.getElementById('auth-age').checked) { feedback('يجب تأكيد أن عمرك 18 عاماً أو أكثر.'); return; }
    submit.disabled = true;
    submit.textContent = 'جارٍ التنفيذ…';
    feedback('');
    try {
      if (mode === 'signup') {
        const displayName = document.getElementById('auth-name').value.trim();
        const {data,error} = await supabase.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin,data:{display_name:displayName,age_confirmed:true}}});
        if (error) throw error;
        feedback(data.session ? 'تم إنشاء الحساب وتسجيل الدخول.' : 'تم إرسال طلب التسجيل. افحص بريدك لتأكيد الحساب.');
      } else {
        const {error} = await supabase.auth.signInWithPassword({email,password});
        if (error) throw error;
        feedback('تم تسجيل الدخول.');
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
    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';
    const values = {
      display_name: document.getElementById('profile-display-name').value.trim(),
      bio: document.getElementById('profile-bio').value.trim(),
      is_private: document.getElementById('profile-private').checked
    };
    try {
      const { error } = await supabase.from('profiles').update(values).eq('id', user.id);
      if (error) throw error;
      feedback('تم حفظ الملف الشخصي.');
    } catch (error) {
      feedback('تعذر حفظ الملف. تأكد من اتصال قاعدة البيانات وحاول مجدداً.');
      console.error('XLive profile update error', error);
    } finally {
      button.disabled = false;
      button.textContent = 'حفظ التغييرات';
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
    if (String(term || '').trim().length < 2) {
      panel.innerHTML = '<p class="field-help">اكتب حرفين على الأقل للبحث عن الحسابات.</p>';
      return;
    }
    const supabase = ensureClient();
    if (!supabase) {
      panel.innerHTML = '<p class="field-help">خدمة الحسابات غير مهيأة بعد.</p>';
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
      const [{data: follows}, {data: requests}, {data: blocks}] = await Promise.all([
        current ? supabase.from('follows').select('followed_id').eq('follower_id', current) : Promise.resolve({data: []}),
        current ? supabase.from('follow_requests').select('target_id,status').eq('requester_id', current) : Promise.resolve({data: []}),
        current ? supabase.from('user_blocks').select('blocked_id').eq('blocker_id', current) : Promise.resolve({data: []})
      ]);
      const following = new Set((follows || []).map(x => x.followed_id));
      const requested = new Map((requests || []).map(x => [x.target_id, x.status]));
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
        return '<article class="social-user"><div><strong>' + name + '</strong><p>@' + handle + (p.is_private ? ' · حساب خاص' : ' · حساب عام') + '</p></div><div class="social-actions">' + action + (current && current !== p.id && !blocked.has(p.id) ? '<button class="button button-danger" data-social-action="block" data-user-id="' + p.id + '">حظر</button>' : '') + '</div></article>';
      }).join('');
      panel.insertAdjacentHTML('beforeend', '<p id="social-feedback" class="auth-feedback" role="status" aria-live="polite"></p>');
    } catch (error) {
      panel.innerHTML = '<p class="field-help">تعذر البحث عن الحسابات. تأكد من تطبيق آخر ترحيلات قاعدة البيانات.</p>';
      console.error('XLive account search error', error);
    }
  }
  async function renderSocialInbox() {
    const supabase = ensureClient();
    if (!supabase || !user) return;
    const requestsPanel = document.getElementById('follow-requests-panel');
    const blocksPanel = document.getElementById('blocked-accounts-panel');
    try {
      const {data: requests, error} = await supabase.from('follow_requests').select('requester_id,created_at').eq('target_id', user.id).eq('status', 'pending').order('created_at', {ascending:false});
      if (error) throw error;
      if (requestsPanel) {
        if (!requests?.length) requestsPanel.innerHTML = '<p class="field-help">لا توجد طلبات معلّقة.</p>';
        else {
          const ids = requests.map(r => r.requester_id);
          const {data: profiles} = await supabase.rpc('search_profiles', {search_term: ''});
          const byId = new Map((profiles || []).map(p => [p.id,p]));
          requestsPanel.innerHTML = requests.map(r => {
            const p = byId.get(r.requester_id);
            return '<article class="social-user"><div><strong>' + escapeHtml(p?.display_name || 'عضو') + '</strong><p>طلب متابعة · ' + r.requester_id.slice(0,8) + '</p></div><div class="social-actions"><button class="button button-primary" data-social-action="accept" data-user-id="' + r.requester_id + '">قبول</button><button class="button button-secondary" data-social-action="reject" data-user-id="' + r.requester_id + '">رفض</button></div></article>';
          }).join('');
          if (!byId.size && ids.length) requestsPanel.querySelectorAll('.social-user p').forEach((node,i) => { node.textContent = 'طلب متابعة من حساب ' + ids[i].slice(0,8); });
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
  async function handleSocialAction(action, targetId) {
    const supabase = ensureClient();
    if (!supabase || !user) { messageSocial('سجّل الدخول أولاً لتنفيذ هذا الإجراء.'); return; }
    try {
      let result;
      if (action === 'follow') result = await supabase.from('follows').insert({follower_id:user.id, followed_id:targetId});
      else if (action === 'unfollow') result = await supabase.from('follows').delete().eq('follower_id',user.id).eq('followed_id',targetId);
      else if (action === 'request') result = await supabase.from('follow_requests').insert({requester_id:user.id,target_id:targetId,status:'pending'});
      else if (action === 'cancel-request') result = await supabase.from('follow_requests').delete().eq('requester_id',user.id).eq('target_id',targetId);
      else if (action === 'accept' || action === 'reject') result = await supabase.from('follow_requests').update({status:action === 'accept' ? 'accepted' : 'rejected'}).eq('requester_id',targetId).eq('target_id',user.id).eq('status','pending');
      else if (action === 'block') result = await supabase.from('user_blocks').insert({blocker_id:user.id,blocked_id:targetId});
      else if (action === 'unblock') result = await supabase.from('user_blocks').delete().eq('blocker_id',user.id).eq('blocked_id',targetId);
      if (result?.error) throw result.error;
      const messages = {follow:'تمت المتابعة.',unfollow:'تم إلغاء المتابعة.',request:'تم إرسال طلب المتابعة.', 'cancel-request':'تم إلغاء طلب المتابعة.',accept:'تم قبول الطلب.',reject:'تم رفض الطلب.',block:'تم حظر الحساب وإزالة علاقات المتابعة.',unblock:'تم إلغاء الحظر.'};
      messageSocial(messages[action] || 'تم تحديث الإجراء.');
      const searchTerm = document.getElementById('global-search')?.value.trim();
      if (document.getElementById('account-search-results') && searchTerm) await renderSearch(searchTerm);
      await renderSocialInbox();
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
    handleSocialAction(button.dataset.socialAction, button.dataset.userId);
  });

  if (window.supabase && config) ensureClient();
  window.XLiveAuth = { render: renderProfile, renderSearch, getUser: () => user, cleanup: () => subscription?.unsubscribe() };
})();