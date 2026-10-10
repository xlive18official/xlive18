(() => {
  const root = document.getElementById('app-view');
  const toast = document.getElementById('toast');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('global-search');
  let toastTimer;

  const views = {
    home: { title: 'الرئيسية', subtitle: 'نظرة عامة على مساحة XLive 18.' },
    clips: { title: 'المقاطع والفيديوهات', subtitle: 'رفع الفيديوهات ومشاهدتها بعد اكتمال المراجعة.' },
    rooms: { title: 'الغرف التفاعلية', subtitle: 'الغرف النصية والصوتية والمرئية ستظهر هنا بعد تجهيز الخدمة.' },
    live: { title: 'البث المباشر', subtitle: 'البث الحي يحتاج إلى خدمة بث واتصال فعلية قبل الإطلاق.' },
    messages: { title: 'الرسائل الخاصة', subtitle: 'المحادثات خاصة، ولا تتوفر قبل تفعيل الحسابات وقاعدة البيانات.' },
    notifications: { title: 'الإشعارات', subtitle: 'إشعارات الحساب والتفاعلات والمراجعة ستُحفظ على الخادم.' },
    saved: { title: 'المحتوى المحفوظ', subtitle: 'ستظهر هنا المقاطع التي تحفظها في حسابك.' },
    profile: { title: 'ملفي الشخصي', subtitle: 'إدارة الملف الشخصي تتطلب تسجيل الدخول وربط الحسابات.' },
    settings: { title: 'الإعدادات والخصوصية', subtitle: 'خيارات الأمان والخصوصية ستُربط بالحساب عند تنفيذ نظام المصادقة.' },
    purchases: { title: 'المشتريات والمحتوى المدفوع', subtitle: 'لا توجد مدفوعات مفعّلة حالياً. لن يتم عرض محتوى مدفوع على أنه قابل للشراء.' },
    search: { title: 'البحث والاستكشاف', subtitle: 'البحث الفعلي يحتاج إلى فهرسة بيانات المنصة المنشورة.' },
    upload: { title: 'رفع مقطع جديد', subtitle: 'نجهّز مسار رفع آمن مع مراجعة قبل النشر.' }
  };

  const descriptions = {
    clips: ['مراجعة المحتوى', 'كل فيديو مرفوع سيبقى قيد المراجعة حتى يوافق عليه مشرف مخوّل.'],
    rooms: ['نوع الغرف لم يُعتمد بعد', 'قبل بناء الاتصال، سنحدد هل تبدأ المنصة بغرف نصية أم صوتية أم مرئية.'],
    live: ['البث غير متصل بعد', 'لن نعرض فيديو مسجلاً على أنه بث حي. يلزم اختيار مزوّد البث واختباره.'],
    messages: ['الخصوصية أولاً', 'لن تتوفر قراءة أو إرسال الرسائل قبل تطبيق التحقق من الهوية وصلاحيات المحادثات.'],
    notifications: ['مصدر الإشعارات', 'ستُنشأ الإشعارات من أحداث موثوقة على الخادم، مع حالة مقروء وغير مقروء.'],
    saved: ['المحفوظات مرتبطة بالحساب', 'تسجيل الدخول وقاعدة البيانات مطلوبان لحفظ المحتوى واسترجاعه بأمان.'],
    profile: ['لا يوجد حساب متصل', 'لم يتم إعداد التسجيل أو تسجيل الدخول بعد. لن ننشئ ملفاً وهمياً أو نعرض أرقاماً تجريبية.'],
    settings: ['إعدادات آمنة افتراضياً', 'ستُطبّق تغييرات الخصوصية والجلسات على الخادم بعد بناء المصادقة.'],
    purchases: ['الدفع غير مفعّل', 'لن يُفتح أي محتوى مدفوع قبل اختيار مزوّد الدفع والتحقق من الدفع من جهة الخادم.'],
    search: ['لا توجد نتائج من قاعدة بيانات', 'لا توجد قاعدة بيانات أو محتويات منشورة موصولة حتى الآن.']
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  function notice(title, message) {
    return '<div class="notice-panel"><span class="notice-icon" aria-hidden="true">ⓘ</span><div><strong>' + title + '</strong><p>' + message + '</p></div></div>';
  }

  function empty(title, message) {
    return '<div class="empty-panel"><div class="empty-symbol" aria-hidden="true">✦</div><h3>' + title + '</h3><p>' + message + '</p><span class="status-pill"><span class="status-dot"></span> بانتظار تنفيذ وربط الخدمة</span></div>';
  }

  function render(view, extra = '') {
    if (!views[view]) view = 'home';
    document.querySelectorAll('[data-view]').forEach(el => {
      const active = el.dataset.view === view;
      el.classList.toggle('active', active);
      if (el.closest('.mobile-nav')) el.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (view === 'home') {
      root.innerHTML = homeMarkup();
      bindLocalActions();
      return;
    }

    const meta = views[view];
    let body = '';
    if (view === 'upload') {
      body = notice('رفع الفيديو غير متاح بعد', 'واجهة الرفع لا ترسل الملفات إلى خادم حالياً. لن نعرض اختيار ملف أو زر نشر يوحي بأن الرفع اكتمل دون تخزين ومراجعة فعليين.') +
        '<div class="simple-panel form-stack"><div class="field"><label for="clip-title">عنوان المقطع</label><input id="clip-title" maxlength="120" placeholder="اكتب عنواناً واضحاً" disabled></div><div class="field"><label for="clip-description">الوصف</label><textarea id="clip-description" maxlength="2000" placeholder="أضف وصفاً للمقطع" disabled></textarea></div><div class="field"><label>حالة الخدمة</label><p class="field-help">التخزين، التحقق من نوع الملف، حدود الحجم، وفحص المحتوى لم تُربط بعد.</p></div><button class="button button-primary disabled-action" disabled>الرفع غير متاح حالياً</button></div>';
    } else if (view === 'profile') {
      body = notice('الحسابات لم تُفعّل بعد', descriptions.profile[1]) + '<div class="section-grid"><div class="simple-panel"><h3>الملف العام</h3><p>الصورة والاسم والنبذة والمتابعون والمقاطع المقبولة.</p></div><div class="simple-panel"><h3>إدارة حسابك</h3><p>المقاطع المرفوعة، حالة المراجعة، المشتريات وإعدادات الخصوصية.</p></div></div>';
    } else if (view === 'settings') {
      body = notice('إعدادات الحساب غير محفوظة', descriptions.settings[1]) + '<div class="section-grid"><div class="simple-panel"><h3>الأمان والجلسات</h3><p>تسجيل الدخول، إدارة الجلسات، واستعادة الحساب.</p></div><div class="simple-panel"><h3>الخصوصية والحظر</h3><p>من يستطيع مراسلتك أو متابعة حسابك، وإدارة الحسابات المحظورة.</p></div></div>';
    } else if (view === 'search') {
      body = notice('نتائج البحث', 'ابحث عن حسابات بالاسم أو اسم المستخدم. لن تُعرض بيانات خاصة مثل النبذة للحسابات الخاصة.') + '<div id="account-search-results" class="social-results"><p class="field-help">جارٍ تجهيز البحث…</p></div>';
    } else {
      const desc = descriptions[view] || ['الخدمة غير متصلة', 'سيتم تفعيل هذه الميزة بعد تنفيذ الخادم وقاعدة البيانات والتحقق من الصلاحيات.'];
      body = notice(desc[0], desc[1]);
      if (view === 'clips') {
        body += '<div class="section-grid"><div class="simple-panel"><h3>المقاطع المقبولة</h3><p>ستظهر فقط الفيديوهات التي اجتازت المراجعة وأُتيحت للمستخدم.</p></div><div class="simple-panel"><h3>مقاطعك قيد المراجعة</h3><p>ستتمكن من متابعة حالة الفيديو ومعرفة سبب الرفض عند الحاجة.</p></div></div><div style="margin-top:18px"><button class="button button-primary" data-view="upload">إضافة مقطع <span>←</span></button></div>';
      } else if (view === 'purchases') {
        body += '<div class="simple-panel"><h3>مشترياتك</h3><p>ستظهر عمليات الشراء المؤكدة فقط بعد ربط مزوّد الدفع والتحقق من إشعاراته على الخادم.</p></div>';
      }
      body += '<div style="margin-top:18px">' + empty('لا توجد بيانات لعرضها بعد', 'هذا القسم ينتظر ربط الخدمة الحقيقية. ستظهر هنا البيانات الفعلية بعد تنفيذها واختبارها.') + '</div>';
    }
    root.innerHTML = '<div class="view-header"><div><p class="eyebrow">XLIVE 18 / WORKSPACE</p><h1>' + meta.title + '</h1><p>' + meta.subtitle + '</p></div><button class="back-home" data-view="home">العودة للرئيسية ←</button></div>' + body;
    if (view === 'search') window.XLiveAuth?.renderSearch(extra);
    if (view === 'messages') window.XLiveAuth?.renderMessages();
    if (view === 'notifications') window.XLiveAuth?.renderNotifications();
    if (view === 'clips') window.XLiveAuth?.renderClips();
    if (view === 'upload') window.XLiveAuth?.renderUpload();
    if (view === 'rooms') window.XLiveAuth?.renderRooms();
    if (view === 'live') window.XLiveAuth?.renderLive();
    if (view === 'settings') window.XLiveAuth?.renderSettings();
    if (view === 'saved') window.XLiveAuth?.renderSaved();
    if (view === 'messages') window.XLiveAuth?.renderMessages();
    if (view === 'notifications') window.XLiveAuth?.renderNotifications();
  }

  function homeMarkup() {
    return '<div class="hero"><div class="hero-copy"><span class="eyebrow"><span class="status-dot"></span> مساحة اجتماعية للبالغين</span><h1>عالمك. <span>مساحتك.</span> تواصلك.</h1><p>منصة واحدة للمقاطع والتواصل والغرف والبث المباشر — تُبنى خطوة بخطوة مع مراعاة الخصوصية والأمان.</p><div class="hero-actions"><button class="button button-primary" data-view="clips">استكشف المقاطع <span>←</span></button><button class="button button-secondary" data-view="profile">إعداد الملف الشخصي</button></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-x">X<span>18</span></div><div class="art-caption">YOUR SPACE. YOUR LIVE.</div></div></div><div class="section-heading"><div><p class="eyebrow">اكتشف المنصة</p><h2>كل ما يهمك، في مكان واحد</h2></div><span class="muted">يتم تفعيل الأقسام عند ربط الخدمات</span></div><div class="feature-grid"><button class="feature-card" data-view="clips"><span class="feature-icon red">▷</span><span class="feature-title">المقاطع</span><span class="feature-desc">مشاهدة ونشر الفيديوهات بعد المراجعة.</span><span class="feature-link">استكشف <b>←</b></span></button><button class="feature-card" data-view="rooms"><span class="feature-icon">◉</span><span class="feature-title">الغرف التفاعلية</span><span class="feature-desc">مساحات للتواصل مع أعضاء المنصة.</span><span class="feature-link">عرض الغرف <b>←</b></span></button><button class="feature-card" data-view="live"><span class="feature-icon red">●</span><span class="feature-title">البث المباشر</span><span class="feature-desc">بث ومشاهدة مباشرة بعد تجهيز الاتصال.</span><span class="feature-link">عرض البثوث <b>←</b></span></button><button class="feature-card" data-view="messages"><span class="feature-icon">✉</span><span class="feature-title">الرسائل الخاصة</span><span class="feature-desc">محادثات خاصة مع ضوابط الخصوصية.</span><span class="feature-link">الرسائل <b>←</b></span></button></div><div class="section-heading section-heading-lower"><div><p class="eyebrow">آخر المستجدات</p><h2>محتوى المنصة</h2></div><button class="text-button" data-view="clips">عرض المقاطع ←</button></div><div class="empty-panel"><div class="empty-symbol">✦</div><h3>ستبدأ القصص هنا</h3><p>لا يوجد محتوى منشور من قاعدة بيانات حتى الآن. لن نعرض بيانات تجريبية على أنها محتوى حقيقي.</p><span class="status-pill"><span class="status-dot"></span> بانتظار ربط الخادم وقاعدة البيانات</span></div><footer class="page-footer"><span>© XLive 18</span><span>الخصوصية أولاً · مراجعة المحتوى · أمان الحساب</span></footer>';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function bindLocalActions() {
    // View navigation is delegated below; no server action is implied by this UI.
  }

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-view]');
    if (!target) return;
    event.preventDefault();
    render(target.dataset.view);
    if (target.dataset.view === 'upload') showToast('رفع الفيديو غير متصل بالخادم بعد.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) {
      showToast('اكتب عبارة للبحث أولاً.');
      searchInput.focus();
      return;
    }
    render('search', query);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  render('home');
})();