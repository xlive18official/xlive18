(() => {
'use strict';
const config=window.XLIVE_SUPABASE;
const root=document.getElementById('app-view');
const db=config&&window.supabase?.createClient?(window.XLiveAuth?.getClient?.() || window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})):null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleDateString('ar'): '—';
async function userNow(){if(!db)return null;const {data}=await db.auth.getSession();return data?.session?.user||null}
async function render(){
 if(!root){alert('تعذر فتح لوحة الإدارة: عنصر الصفحة غير موجود.');return}
 if(!db){root.innerHTML='<div class="view-header"><p class="eyebrow">XLIVE 18 / ADMIN</p><h1>لوحة الإدارة</h1></div><div class="simple-panel"><h3>تعذر تهيئة خدمة الإدارة</h3><p>إعدادات Supabase أو مكتبة الاتصال غير متاحة. أعد تحميل الصفحة، وإذا استمرت المشكلة أرسل هذه الرسالة للدعم.</p><p>config: '+Boolean(config)+' · supabase: '+Boolean(window.supabase?.createClient)+'</p></div>';return}
 const u=await userNow();
 document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view==='admin'));
 if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){root.innerHTML='<div class="view-header"><h1>الإدارة</h1></div><div class="simple-panel"><h3>غير مصرح</h3><p>هذه الصفحة مخصصة لحساب الإدارة فقط.</p></div>';return}
 root.innerHTML='<div class="view-header"><div><p class="eyebrow">XLIVE 18 / ADMIN</p><h1>لوحة الإدارة</h1><p>مراجعة المنشورات وإدارة الحسابات.</p></div><button class="button button-secondary" data-admin-action="refresh">تحديث</button></div><div id="admin-stats" class="admin-stats">جارٍ تحميل الإحصاءات…</div><section class="simple-panel admin-section"><h2>المنشورات بانتظار الموافقة</h2><div id="admin-queue">جارٍ تحميل قائمة المراجعة…</div></section><section class="simple-panel admin-section"><h2>إدارة الحسابات</h2><p>حظر الحسابات أو إلغاء حظرها أو حذف الحساب نهائياً.</p><div id="admin-users">جارٍ تحميل الحسابات…</div></section>';
 const [s,q,us]=await Promise.all([db.rpc('admin_dashboard_stats'),db.rpc('admin_moderation_queue'),db.rpc('admin_list_users')]);
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
  return '<article class="admin-queue-card">'+media+'<div class="admin-item-info"><span class="status-pill">'+(x.type==='video'?'فيديو':'صورة')+'</span><h3>'+esc(x.title||'منشور بلا عنوان')+'</h3><p>'+esc(x.description||'')+'</p><small>'+esc(x.username?'@'+x.username:x.owner_email||x.owner_id)+' · '+date(x.created_at)+'</small><div class="social-actions"><button class="button button-primary" data-admin-action="approve" data-kind="'+x.type+'" data-id="'+x.id+'">موافقة ونشر</button><button class="button button-secondary" data-admin-action="reject" data-kind="'+x.type+'" data-id="'+x.id+'">رفض</button><button class="button button-danger" data-admin-action="delete-content" data-kind="'+x.type+'" data-id="'+x.id+'">حذف</button></div></div></article>';
 }))).join('')+'</div>';
 const users=document.getElementById('admin-users');
 if(us.error)users.innerHTML='<p>تعذر تحميل الحسابات: '+esc(us.error.message)+'</p>';
 else users.innerHTML='<div class="admin-user-list">'+(us.data||[]).map(p=>'<article class="admin-user-row"><div><strong>'+esc(p.display_name||p.username||'مستخدم')+'</strong><p>'+esc(p.email||'')+'</p><small>انضم '+date(p.created_at)+(p.banned?' · محظور':'')+'</small></div><div class="social-actions">'+(p.id===u.id?'<span class="status-pill">حسابك الإداري</span>':(p.banned?'<button class="button button-secondary" data-admin-action="unban-user" data-id="'+p.id+'">إلغاء الحظر</button>':'<button class="button button-secondary" data-admin-action="ban-user" data-id="'+p.id+'">حظر الحساب</button>')+'<button class="button button-danger" data-admin-action="delete-user" data-id="'+p.id+'">حذف الحساب</button>')+'</div></article>').join('')+'</div>';
}
document.addEventListener('click',async e=>{
 const nav=e.target.closest('#admin-nav,#admin-mobile-nav,[data-view="admin"]');
 if(nav){e.preventDefault();e.stopImmediatePropagation();if(!root){alert('تعذر فتح لوحة الإدارة: عنصر الصفحة غير موجود.');return}if(!window.XLIVE_SUPABASE||!window.supabase?.createClient){root.innerHTML='<div class="view-header"><h1>لوحة الإدارة</h1></div><div class="simple-panel"><h3>تعذر الاتصال بخدمة الإدارة</h3><p>تحقق من تحميل إعدادات Supabase ثم أعد تحميل الصفحة.</p></div>';return}await render();return}
 const b=e.target.closest('[data-admin-action]');if(!b)return;
 e.preventDefault();e.stopImmediatePropagation();
 const act=b.dataset.adminAction;if(act==='refresh'){await render();return}
 const u=await userNow();if(!u||(u.app_metadata?.role!=='admin'&&String(u.email||'').toLowerCase()!=='xlive18.official@gmail.com')){alert('غير مصرح');return}
 if(act==='approve'||act==='reject'){
  let reason=null;if(act==='reject'){reason=prompt('سبب الرفض (اختياري):');if(reason===null)return}
  const {error}=await db.rpc('admin_review_content',{p_type:b.dataset.kind,p_id:b.dataset.id,p_decision:act,p_reason:reason});
  if(error){alert('تعذر تحديث المنشور: '+error.message);return}
 }else if(act==='delete-content'){
  if(!confirm('حذف المنشور وملفه نهائياً؟'))return;
  const {error}=await db.rpc('admin_delete_content',{p_type:b.dataset.kind,p_id:b.dataset.id});if(error){alert('تعذر الحذف: '+error.message);return}
 }else if(act==='ban-user'){
  if(!confirm('حظر هذا الحساب ومنعه من تسجيل الدخول؟'))return;
  const {error}=await db.rpc('admin_ban_user',{p_user_id:b.dataset.id,p_reason:'حظر من لوحة الإدارة'});if(error){alert('تعذر الحظر: '+error.message);return}
 }else if(act==='unban-user'){
  if(!confirm('إلغاء حظر الحساب؟'))return;
  const {error}=await db.rpc('admin_unban_user',{p_user_id:b.dataset.id});if(error){alert('تعذر إلغاء الحظر: '+error.message);return}
 }else if(act==='delete-user'){
  if(!confirm('سيتم حذف الحساب نهائياً. هل تريد المتابعة؟'))return;
  const {error}=await db.rpc('admin_delete_user',{p_user_id:b.dataset.id});if(error){alert('تعذر حذف الحساب: '+error.message);return}
 }
 await render();
},true);
window.XLiveAdmin={render};
})();
