(() => {
  'use strict';
  const cfg = window.XLIVE_SUPABASE;
  let client;
  let design = {};
  const $ = id => document.getElementById(id);
  async function init() {
    if (!window.supabase || !cfg?.url || !cfg?.publishableKey) return;
    client = window.supabase.createClient(cfg.url, cfg.publishableKey);
    const {data:{session}} = await client.auth.getSession();
    const admin = session?.user?.app_metadata?.role === 'admin';
    document.querySelectorAll('[data-view="editor"]').forEach(el => el.hidden = !admin);
    if (!admin) return;
    const {data} = await client.from('site_page_designs').select('design').eq('page_key','home').maybeSingle();
    design = data?.design || {};
    apply();
  }
  function apply() {
    const hero = document.querySelector('.hero');
    if (hero) {
      if (design.background) hero.style.backgroundImage = 'linear-gradient(90deg,rgba(4,6,15,.88),rgba(4,6,15,.38)),url("' + design.background.replace(/["\\\\]/g,'') + '")';
      if (design.heroTitle) { const h=hero.querySelector('h1'); if(h) h.textContent=design.heroTitle; }
      if (design.heroText) { const p=hero.querySelector('.hero-copy>p'); if(p) p.textContent=design.heroText; }
    }
    if (design.logo) document.querySelectorAll('.brand-mark').forEach(el => {el.textContent='';el.style.backgroundImage='url("' + design.logo.replace(/["\\\\]/g,'') + '")';el.style.backgroundSize='contain';el.style.backgroundPosition='center';el.style.backgroundRepeat='no-repeat';});
    if (design.accent) document.documentElement.style.setProperty('--red',design.accent);
  }
  function renderEditor() {
    const root=$('app-view');
    root.innerHTML='<section class="home-page site-editor"><div class="view-header"><div><p class="eyebrow">XLIVE18 / VISUAL EDITOR</p><h1>محرّر تصميم الموقع</h1><p>عدّل مظهر الصفحة الرئيسية، ثم احفظ وانشر.</p></div><button class="back-home" data-view="home">معاينة الرئيسية</button></div><div class="simple-panel form-stack"><label class="field">عنوان الواجهة الرئيسية<input id="ed-title" maxlength="140"></label><label class="field">النص التعريفي<textarea id="ed-text" maxlength="600" rows="3"></textarea></label><label class="field">لون الهوية<input id="ed-color" type="color"></label><label class="field">صورة خلفية الصفحة الرئيسية<input id="ed-bg" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="field">شعار الموقع<input id="ed-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label><p class="field-help">الصور تُرفع إلى التخزين السحابي، والحد الأقصى لكل صورة 8 ميغابايت.</p><div class="hero-actions"><button class="button button-secondary" id="ed-preview">معاينة</button><button class="button button-primary" id="ed-save">حفظ ونشر</button></div><p id="ed-status" role="status"></p></div></section>';
    $('ed-title').value=design.heroTitle||'عالمك. مساحتك. تواصلك.';
    $('ed-text').value=design.heroText||'منصة واحدة للمقاطع والتواصل والغرف والبث المباشر — تُبنى خطوة بخطوة مع مراعاة الخصوصية والأمان.';
    $('ed-color').value=design.accent||'#f04452';
    const status=$('ed-status');
    const upload=async input=>{
      const file=input.files?.[0]; if(!file)return null;
      if(file.size>8*1024*1024) throw Error('حجم الصورة يتجاوز 8 ميغابايت.');
      const path='home/'+Date.now()+'-'+file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const {error}=await client.storage.from('site-design-assets').upload(path,file,{upsert:false,contentType:file.type});
      if(error)throw error;
      return client.storage.from('site-design-assets').getPublicUrl(path).data.publicUrl;
    };
    $('ed-preview').onclick=async()=>{try{design={...design,heroTitle:$('ed-title').value,heroText:$('ed-text').value,accent:$('ed-color').value};design.background=await upload($('ed-bg'))||design.background;design.logo=await upload($('ed-logo'))||design.logo;apply();status.textContent='تمت المعاينة. اضغط حفظ ونشر لتثبيت التغييرات.';}catch(e){status.textContent=e.message||'تعذرت المعاينة.';}};
    $('ed-save').onclick=async()=>{const btn=$('ed-save');btn.disabled=true;status.textContent='جارٍ حفظ التغييرات…';try{design={...design,heroTitle:$('ed-title').value,heroText:$('ed-text').value,accent:$('ed-color').value};design.background=await upload($('ed-bg'))||design.background;design.logo=await upload($('ed-logo'))||design.logo;const {data:{user}}=await client.auth.getUser();const {error}=await client.from('site_page_designs').upsert({page_key:'home',design,updated_by:user.id},{onConflict:'page_key'});if(error)throw error;apply();status.textContent='تم حفظ ونشر التصميم بنجاح.';}catch(e){status.textContent='تعذر الحفظ: '+(e.message||'تحقق من صلاحية المدير وإعدادات التخزين.');}finally{btn.disabled=false;}};
  }
  document.addEventListener('click',e=>{if(e.target.closest('[data-view="editor"]')){e.preventDefault();if(!client)return;renderEditor();}});
  window.XLiveSiteEditor={init,apply,renderEditor};
  init();
})();