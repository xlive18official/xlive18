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
  if (window.supabase && config) ensureClient();
  window.XLiveAuth = { render: renderProfile, getUser: () => user, cleanup: () => subscription?.unsubscribe() };
})();