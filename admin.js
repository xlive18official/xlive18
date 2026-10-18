(() => {
'use strict';
const config=window.XLIVE_SUPABASE;
const root=document.getElementById('app-view');
const db=config&&window.supabase?.createClient?(window.XLiveAuth?.getClient?.() || window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})):null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleDateString('ar'): '—';
const privateItems = new Map();
function notify(message){
 if(window.XLiveApp?.showToast){window.XLiveApp.showToast(message);return}
 let n=document.getElementById('admin-feedback');
 if(!n&&root){n=document.createElement('div');n.id='admin-feedback';n.className='notice-panel';n.setAttribute('role','status');n.setAttribute('aria-live','polite');root.prepend(n)}
 if(n)n.textContent=message;
}
function siteDialog(message,{confirm=false,danger=false,input=false,inputLabel='التفاصيل (اختياري)',confirmLabel='متابعة'}={}){
 return new Promise(resolve=>{
  root.querySelector('[data-admin-dialog]')?.remove();
  const modal=document.createElement('div');modal.dataset.adminDialog='true';modal.className='admin-dialog-backdrop';modal.setAttribute('role','presentation');
  modal.innerHTML='<section class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"><div class="admin-dialog-mark">'+(danger?'!':'i')+'</div><h2 id="admin-dialog-title">'+(danger?'تأكيد الإجراء':'تأكيد من لوحة الإدارة')+'</h2><p class="admin-dialog-message">'+esc(message)+'</p>'+(input?'<label class="admin-dialog-input-label" for="admin-dialog-input">'+esc(inputLabel)+'</label><textarea id="admin-dialog-input" rows="3" maxlength="500" placeholder="اكتب السبب هنا…"></textarea>':'')+'<div class="admin-dialog-actions"><button type="button" class="button button-secondary" data-dialog-choice="cancel">إلغاء</button><button type="button" class="button '+(danger?'button-danger':'button-primary')+'" data-dialog-choice="ok">'+esc(confirmLabel)+'</button></div></section>';
  root.appendChild(modal);
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKey);modal.remove();resolve(value)};
  const onKey=event=>{if(event.key==='Escape'){event.preventDefault();finish(input?null:false)}};
  modal.addEventListener('click',event=>{const choice=event.target.closest('[data-dialog-choice]');if(choice){if(choice.dataset.dialogChoice==='cancel'){finish(input?null:false);return}finish(input?(modal.querySelector('#admin-dialog-input')?.value||''):true);return}if(event.target===modal)finish(input?null:false)});
  document.addEventListener('keydown',onKey);
  modal.querySelector('[data-dialog-choice="ok"]')?.focus();
 });
}
async function userNow(){if(!db)return null;const {data}=await db.auth.getSession();return data?.session?.user||null}
async function render(){
 if(!root){notify('تعذر فتح لوحة الإدارة: عنصر الصفحة غير موجود.');return}
 if(!db){root.innerHTML='<div class="view-header"><p class="eyebrow">XLIVE 18 / ADMIN</p><h1>لوحة الإدارة</h1></div><div class="simple-panel"><h3>تعذر تهيئة خدمة الإدارة</h3><p>إعدادات Supabase أو مكتبة الاتصال غير متاحة. أعد تحميل الصفحة، وإذا استمرت المشكلة أرسل هذه الرسالة للدعم.</p><p>config: '+Boolean(config)+' · supabase: '+Boolean(window.supabase?.createClient)+'</p></div>';return}
 const u=await userNow();
 document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view==='admin'));
 if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){root.innerHTML='<div class="view-header"><h1>الإدارة</h1></div><div class="simple-panel"><h3>غير مصرح</h3><p>هذه الصفحة مخصصة لحساب الإدارة فقط.</p></div>';return}
 root.innerHTML='<div class="view-header"><div><p class="eyebrow">XLIVE 18 / ADMIN</p><h1>لوحة الإدارة</h1><p>مراجعة المنشورات وإدارة الحسابات.</p></div><button class="button button-secondary" data-admin-action="refresh">تحديث</button></div><div id="admin-stats" class="admin-stats">جارٍ تحميل الإحصاءات…</div><section class="simple-panel admin-section"><h2>المنشورات بانتظار الموافقة</h2><div id="admin-queue">جارٍ تحميل قائمة المراجعة…</div></section><section class="simple-panel admin-section"><h2>إضافة فيديو من رابط خارجي</h2><p>الفيديو يبقى لدى المصدر ولا يُنزّل إلى تخزين XLIVE18. استخدم رابط تضمين رسمي وتأكد من حقوق إعادة العرض وموافقات البالغين. الروابط الجديدة تبقى معلّقة حتى توافق عليها.</p><form id="external-video-link-form" class="form-stack"><div class="field"><label for="external-video-title">عنوان المقطع</label><input id="external-video-title" name="title" maxlength="160" required placeholder="عنوان واضح للمقطع"></div><div class="field"><label for="external-video-description">وصف (اختياري)</label><textarea id="external-video-description" name="description" maxlength="2000" rows="2" placeholder="وصف مختصر"></textarea></div><div class="field"><label for="external-video-source">رابط صفحة المصدر الأصلية (HTTPS)</label><input id="external-video-source" name="source_url" type="url" required placeholder="https://..."></div><div class="field"><label for="external-video-embed">رابط التضمين الرسمي (HTTPS)</label><input id="external-video-embed" name="embed_url" type="url" required placeholder="https://.../embed/..."></div><label class="field-help"><input type="checkbox" name="rights_confirmed" required> أؤكد أن لدي الحق في تضمين هذا الفيديو وإعادة عرضه، وأن المحتوى قانوني وموافقات البالغين موثّقة.</label><button class="button button-primary" type="submit">حفظ الرابط للمراجعة</button><p id="external-video-link-feedback" class="auth-feedback" role="status" aria-live="polite"></p></form><div id="external-video-links-list">جارٍ تحميل الروابط…</div></section><section class="simple-panel admin-section"><h2>المحتوى الخاص</h2><p>المحتوى هنا لا يظهر إلا للإدارة المعتمدة. يتم تسجيل عمليات العرض والحذف.</p><div id="admin-private-content">جارٍ تحميل المحتوى الخاص…</div></section><section class="simple-panel admin-section"><h2>إدارة الحسابات</h2><p>حظر الحسابات أو إلغاء حظرها أو حذف الحساب نهائياً.</p><div id="admin-users">جارٍ تحميل الحسابات…</div></section>';
 const [s,q,us,privateResult]=await Promise.all([db.rpc('admin_dashboard_stats'),db.rpc('admin_moderation_queue'),db.rpc('admin_list_users'),db.rpc('admin_private_content_list')]);
 if(!document.getElementById('admin-stats'))return;
 const stats=document.getElementById('admin-stats');
 stats.innerHTML=s.error?'<p>تعذر تحميل الإحصاءات: '+esc(s.error.message)+'</p>':[['المستخدمون',s.data.users],['الفيديوهات',s.data.videos],['الصور',s.data.photos],['بانتظار الموافقة',Number(s.data.pending_videos)+Number(s.data.pending_photos)],['الحسابات المحظورة',s.data.banned_users]].map(x=>'<article class="admin-stat"><small>'+x[0]+'</small><strong>'+Number(x[1]||0).toLocaleString('ar')+'</strong></article>').join('');
 const queue=document.getElementById('admin-queue');
 if(q.error)queue.innerHTML='<p>تعذر تحميل قائمة المراجعة: '+esc(q.error.message)+'</p>';
 else if(!q.data?.length)queue.innerHTML='<div class="empty-panel"><h3>لا توجد منشورات معلّقة</h3><p>ستظهر هنا الفيديوهات والصور التي تنتظر موافقتك.</p></div>';
 else queue.innerHTML='<div class="admin-queue-list">'+(await Promise.all(q.data.map(async x=>{
  let media='<div class="clip-placeholder">المعاينة غير متاحة</div>';
  const bucket=x.type==='video'?'video-originals':'photo-originals', path=x.type==='video'?(x.preview_path||x.storage_path):x.storage_path;
  const {data}=await db.storage.from(bucket).createSignedUrl(path,1800);
  if(data?.signedUrl)media=x.type==='video'&&!x.preview_path?'<video class="admin-media-preview" controls playsinline preload="metadata" src="'+esc(data.signedUrl)+'"></video>':'<img class="admin-media-preview" src="'+esc(data.signedUrl)+'" alt="معاينة المنشور">';
  return '<article class="admin-queue-card">'+media+'<div class="admin-item-info"><span class="status-pill">'+(x.type==='video'?'فيديو':'صورة')+'</span><h3>'+esc(x.title||'منشور بلا عنوان')+'</h3><p>'+esc(x.description||'')+'</p><small>'+esc(x.username?'@'+x.username:x.owner_email||x.owner_id)+' · '+date(x.created_at)+'</small><div class="social-actions"><button class="button button-primary" data-admin-action="approve" data-kind="'+x.type+'" data-id="'+x.id+'">موافقة ونشر</button><button class="button button-secondary" data-admin-action="reject" data-kind="'+x.type+'" data-id="'+x.id+'">رفض</button><button class="button button-danger" data-admin-action="delete-content" data-kind="'+x.type+'" data-id="'+x.id+'" data-storage-path="'+esc(x.storage_path)+'" data-preview-path="'+esc(x.preview_path||'')+'">حذف</button></div></div></article>';
 }))).join('')+'</div>';
 const privatePanel=document.getElementById('admin-private-content');
 privateItems.clear();
 if(privateResult.error) privatePanel.innerHTML='<p>تعذر تحميل المحتوى الخاص: '+esc(privateResult.error.message)+'</p>';
 else {
  const privateRows=Array.isArray(privateResult.data)?privateResult.data:[];
  privateRows.forEach(item=>privateItems.set(item.type+':'+item.id,item));
  privatePanel.innerHTML=privateRows.length?'<div class="admin-queue-list">'+privateRows.map(item=>'<article class="admin-queue-card"><div class="admin-item-info"><span class="status-pill">'+(item.type==='video'?'فيديو خاص':'صورة خاصة')+'</span><h3>'+esc(item.title||'محتوى بلا عنوان')+'</h3><p>'+esc(item.description||'')+'</p><small>@'+esc(item.username||'مستخدم')+' · '+esc(item.status||'')+' · '+date(item.created_at)+'</small><div class="social-actions"><button class="button button-primary" data-private-action="view" data-kind="'+item.type+'" data-id="'+item.id+'">عرض المحتوى</button><button class="button button-danger" data-private-action="delete" data-kind="'+item.type+'" data-id="'+item.id+'">حذف نهائي</button></div></div></article>').join('')+'</div>':'<div class="empty-panel"><h3>لا يوجد محتوى خاص حالياً</h3><p>ستظهر هنا المقاطع والصور التي ضبط أصحابها على «خاص».</p></div>';
 }
 const users=document.getElementById('admin-users');
 if(us.error)users.innerHTML='<p>تعذر تحميل الحسابات: '+esc(us.error.message)+'</p>';
 else users.innerHTML='<div class="admin-user-list">'+(us.data||[]).map(p=>'<article class="admin-user-row"><div><strong>'+esc(p.display_name||p.username||'مستخدم')+'</strong><p>'+esc(p.email||'')+'</p><small>انضم '+date(p.created_at)+(p.banned?' · محظور':'')+'</small></div><div class="social-actions">'+(p.id===u.id?'<span class="status-pill">حسابك الإداري</span>':(p.banned?'<button class="button button-secondary" data-admin-action="unban-user" data-id="'+p.id+'">إلغاء الحظر</button>':'<button class="button button-secondary" data-admin-action="ban-user" data-id="'+p.id+'">حظر الحساب</button>')+'<button class="button button-danger" data-admin-action="delete-user" data-id="'+p.id+'">حذف الحساب</button>')+'</div></article>').join('')+'</div>';
 const externalList=document.getElementById('external-video-links-list');
 if(externalList){
  const {data:links,error:linksError}=await db.from('external_video_links').select('id,title,description,source_url,embed_url,status,created_at').order('created_at',{ascending:false}).limit(100);
  if(linksError) externalList.innerHTML='<p>تعذر تحميل روابط الفيديو: '+esc(linksError.message)+'. تأكد من تطبيق ترحيل قاعدة البيانات.</p>';
  else externalList.innerHTML=(links||[]).length?'<div class="admin-queue-list">'+links.map(v=>'<article class="admin-queue-card"><div class="admin-item-info"><span class="status-pill">'+(v.status==='approved'?'ظاهر على الموقع':v.status==='removed'?'مزال':'بانتظار الموافقة')+'</span><h3>'+esc(v.title)+'</h3><p>'+esc(v.description||'')+'</p><small><a href="'+esc(v.source_url)+'" target="_blank" rel="noopener noreferrer">فتح المصدر الأصلي ↗</a></small><div class="social-actions">'+(v.status!=='approved'?'<button class="button button-primary" data-external-action="approve" data-id="'+v.id+'">إظهار على الموقع</button>':'<button class="button button-secondary" data-external-action="pending" data-id="'+v.id+'">إخفاء</button>')+'<button class="button button-danger" data-external-action="delete" data-id="'+v.id+'">حذف الرابط</button></div></div></article>').join('')+'</div>':'<p class="field-help">لم تُضف روابط خارجية بعد.</p>';
 }

}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('#admin-nav,#admin-mobile-nav,[data-view="admin"]');
 if(nav){e.preventDefault();e.stopImmediatePropagation();if(!root){notify('تعذر فتح لوحة الإدارة: عنصر الصفحة غير موجود.');return}if(!window.XLIVE_SUPABASE||!window.supabase?.createClient){root.innerHTML='<div class="view-header"><h1>لوحة الإدارة</h1></div><div class="simple-panel"><h3>تعذر الاتصال بخدمة الإدارة</h3><p>تحقق من تحميل إعدادات Supabase ثم أعد تحميل الصفحة.</p></div>';return}await render();return}
 if(e.target.closest('[data-private-action="close"]')){const viewer=root.querySelector('[data-private-viewer]');if(viewer){viewer.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load()});viewer.remove()}return}
 const privateAction=e.target.closest('[data-private-action]');
 if(privateAction){
  e.preventDefault();e.stopImmediatePropagation();
  const type=privateAction.dataset.kind,id=privateAction.dataset.id,item=privateItems.get(type+':'+id);
  if(!item){notify('لم يعد هذا المحتوى متاحاً. حدّث لوحة الإدارة.');return}
  if(privateAction.dataset.privateAction==='delete'){
   if(!await siteDialog('سيتم حذف هذا المحتوى الخاص وملفاته نهائياً. لا يمكن التراجع عن هذه العملية.',{confirm:true,danger:true,confirmLabel:'حذف نهائي'}))return;
   privateAction.disabled=true;
   const bucket=type==='video'?'video-originals':'photo-originals'; const paths=[item.storage_path,...(type==='video'&&item.preview_path?[item.preview_path]:[])].filter(Boolean); const {error:storageError}=await db.storage.from(bucket).remove(paths); if(storageError){notify('تعذر حذف الملف من التخزين: '+esc(storageError.message));privateAction.disabled=false;return} const {error}=await db.rpc('admin_delete_private_content',{p_type:type,p_id:id});
   if(error){notify('تعذر حذف المحتوى: '+esc(error.message));privateAction.disabled=false;return}
   notify('تم حذف المحتوى الخاص وملفاته نهائياً.');
   await render();return;
  }
  const {error:logError}=await db.rpc('admin_log_private_content_access',{p_type:type,p_id:id});
  if(logError){notify('تعذر تسجيل عملية الاطلاع؛ لم يتم فتح الملف.');return}
  const bucket=type==='video'?'video-originals':'photo-originals';
  const {data,error}=await db.storage.from(bucket).createSignedUrl(item.storage_path,300);
  if(error||!data?.signedUrl){notify('تعذر فتح الملف الخاص. تحقق من صلاحيات التخزين.');return}
  root.querySelector('[data-private-viewer]')?.remove();
  const media=type==='video'?'<video controls playsinline preload="metadata" style="max-width:100%;max-height:70vh" src="'+esc(data.signedUrl)+'"></video>':'<img alt="محتوى خاص" style="max-width:100%;max-height:70vh;object-fit:contain" src="'+esc(data.signedUrl)+'">';
  root.insertAdjacentHTML('beforeend','<div data-private-viewer role="dialog" aria-modal="true" aria-label="عرض محتوى خاص" style="position:fixed;inset:0;z-index:10000;background:#000d;display:flex;align-items:center;justify-content:center;padding:16px"><div class="simple-panel" style="width:min(760px,100%);max-height:90vh;overflow:auto;text-align:center"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2>'+esc(item.title||'محتوى خاص')+'</h2><button class="button button-secondary" data-private-action="close">إغلاق</button></div><p>معاينة إدارية خاصة — لا تجعل الملف عاماً أو تشارك رابطه.</p>'+media+'</div></div>');
  return;
 }
 const b=e.target.closest('[data-admin-action]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 const act=b.dataset.adminAction;if(act==='refresh'){await render();return}
 const u=await userNow();if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){notify('غير مصرح لك بتنفيذ هذا الإجراء.');return}
 if(act==='approve'||act==='reject'){
  let reason=null;if(act==='reject'){reason=await siteDialog('يمكنك كتابة سبب رفض المنشور ليظهر ضمن سجل المراجعة.',{input:true,inputLabel:'سبب الرفض (اختياري)',confirmLabel:'تأكيد الرفض'});if(reason===null)return}
  const {error}=await db.rpc('admin_review_content',{p_type:b.dataset.kind,p_id:b.dataset.id,p_decision:act,p_reason:reason});
  if(error){notify('تعذر تحديث المنشور: '+error.message);return}
 }else if(act==='delete-content'){
  if(!await siteDialog('سيتم حذف المنشور وملفاته نهائياً. لا يمكن التراجع عن هذه العملية.',{confirm:true,danger:true,confirmLabel:'حذف نهائي'}))return;
  const kind=b.dataset.kind,bucket=kind==='video'?'video-originals':'photo-originals';const paths=[b.dataset.storagePath,...(kind==='video'&&b.dataset.previewPath?[b.dataset.previewPath]:[])].filter(Boolean);const {error:storageError}=await db.storage.from(bucket).remove(paths);if(storageError){notify('تعذر حذف الملف من التخزين: '+esc(storageError.message));return}const {error}=await db.rpc('admin_delete_content',{p_type:kind,p_id:b.dataset.id});if(error){notify('حُذفت الملفات من التخزين لكن تعذر حذف سجل المحتوى: '+esc(error.message));return}
 }else if(act==='ban-user'){
  if(!await siteDialog('سيتم حظر هذا الحساب ومنعه من تسجيل الدخول.',{confirm:true,danger:true,confirmLabel:'حظر الحساب'}))return;
  const {error}=await db.rpc('admin_ban_user',{p_user_id:b.dataset.id,p_reason:'حظر من لوحة الإدارة'});if(error){notify('تعذر الحظر: '+error.message);return}
 }else if(act==='unban-user'){
  if(!await siteDialog('هل تريد إلغاء حظر هذا الحساب؟',{confirm:true,confirmLabel:'إلغاء الحظر'}))return;
  const {error}=await db.rpc('admin_unban_user',{p_user_id:b.dataset.id});if(error){notify('تعذر إلغاء الحظر: '+error.message);return}
 }else if(act==='delete-user'){
  if(!await siteDialog('سيتم حذف الحساب نهائياً. قد يؤدي ذلك إلى فقدان بياناته المرتبطة، ولا يمكن التراجع عن العملية.',{confirm:true,danger:true,confirmLabel:'حذف الحساب نهائياً'}))return;
  const {error}=await db.rpc('admin_delete_user',{p_user_id:b.dataset.id});if(error){notify('تعذر حذف الحساب: '+error.message);return}
 }
 notify(({approve:'تمت مراجعة المنشور والموافقة عليه بنجاح.',reject:'تم رفض المنشور.', 'delete-content':'تم حذف المنشور.', 'ban-user':'تم حظر الحساب.', 'unban-user':'تم إلغاء حظر الحساب.', 'delete-user':'تم حذف الحساب.'})[act]||'تم تنفيذ الإجراء بنجاح.');
 await render();
},true);

document.addEventListener('submit',async event=>{
 const form=event.target.closest('#external-video-link-form');if(!form)return;
 event.preventDefault();
 const feedback=form.querySelector('#external-video-link-feedback'),say=message=>{if(feedback)feedback.textContent=message};
 const u=await userNow();
 if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){say('غير مصرح لك بإضافة روابط.');return}
 const title=form.elements.title.value.trim(),description=form.elements.description.value.trim();
 let source,embed;try{source=new URL(form.elements.source_url.value.trim());embed=new URL(form.elements.embed_url.value.trim())}catch(_){say('أدخل رابطين صالحين.');return}
 if(!form.elements.rights_confirmed.checked){say('أكد صلاحية الاستخدام والموافقات قبل الحفظ.');return}
 if(source.protocol!=='https:'||embed.protocol!=='https:'||source.username||source.password||embed.username||embed.password){say('يجب استخدام روابط HTTPS آمنة من دون بيانات دخول ضمن الرابط.');return}
 if(!title){say('اكتب عنوان المقطع.');return}
 const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
 const {error}=await db.from('external_video_links').insert({title,description,source_url:source.href,embed_url:embed.href,status:'pending',created_by:u.id});
 if(error){say('تعذر حفظ الرابط: '+error.message);if(submit)submit.disabled=false;return}
 form.reset();say('تم حفظ الرابط للمراجعة. لن يظهر للعامة حتى توافق عليه.');await render();
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-external-action]');if(!button)return;
 event.preventDefault();event.stopPropagation();
 const u=await userNow();
 if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){notify('غير مصرح لك بإدارة روابط الفيديو.');return}
 const id=button.dataset.id,action=button.dataset.externalAction;
 if(action==='delete'&&!await siteDialog('سيتم حذف رابط الفيديو من XLIVE18 فقط. الملف الأصلي سيبقى على موقع المصدر.',{confirm:true,danger:true,confirmLabel:'حذف الرابط'}))return;
 button.disabled=true;
 if(action==='approve'||action==='pending'){
  const {error}=await db.from('external_video_links').update({status:action==='approve'?'approved':'pending',updated_at:new Date().toISOString()}).eq('id',id);
  if(error){notify('تعذر تحديث حالة الرابط: '+error.message);button.disabled=false;return}
  notify(action==='approve'?'تم إظهار الرابط على الموقع.':'تم إخفاء الرابط من العرض العام.');
 }else if(action==='delete'){
  const {error}=await db.from('external_video_links').delete().eq('id',id);
  if(error){notify('تعذر حذف الرابط: '+error.message);button.disabled=false;return}
  notify('تم حذف الرابط من XLIVE18 فقط.');
 }else return;
 await render();
});
window.XLiveAdmin={render};
})();
