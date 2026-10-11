(() => {
'use strict';
function getClient(){
  try { return window.XLiveAuth?.getClient?.() || null; } catch (_) { return null; }
}
function sync(){
  const db=getClient();
  const a=document.getElementById('admin-nav');
  const b=document.getElementById('admin-mobile-nav');
  const out=document.getElementById('mobile-signout');
  if(!db){ if(a){a.hidden=false;a.removeAttribute('aria-hidden');} return; }
  db.auth.getSession().then(({data,error})=>{
    if(error) throw error;
    const u=data?.session?.user||window.XLiveAuth?.getUser?.()||null;
    const admin=!!u&&(u.app_metadata?.role==='admin'||String(u.email||'').toLowerCase()==='xlive18.official@gmail.com');
    if(a){a.hidden=false;a.removeAttribute('aria-hidden');a.style.removeProperty('display');a.dataset.adminSession=String(admin);}
    if(b)b.hidden=!admin;
    if(out)out.hidden=!u;
    if(u)db.rpc('is_account_banned').then(async result=>{
      if(result.data===true){await db.auth.signOut();alert('تم إيقاف هذا الحساب. تواصل مع الإدارة إذا كنت تعتقد أن هذا خطأ.');}
    }).catch(()=>{});
  }).catch(()=>{});
}
function attach(){
  const db=getClient();
  if(!db){setTimeout(attach,250);return;}
  sync();
  db.auth.onAuthStateChange(()=>{sync();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attach,{once:true});else attach();
document.addEventListener('click',async e=>{
  const out=e.target.closest('#mobile-signout');if(!out)return;
  const db=getClient();if(!db)return;
  e.preventDefault();e.stopImmediatePropagation();await db.auth.signOut();window.location.reload();
},true);
})();