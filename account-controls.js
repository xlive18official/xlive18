(() => {
'use strict';
const cfg=window.XLIVE_SUPABASE;
if(!cfg||!window.supabase?.createClient)return;
const db=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
async function sync(){
 const {data}=await db.auth.getSession();const u=data?.session?.user||null;
 const admin=u?.app_metadata?.role==='admin';
 const a=document.getElementById('admin-nav'),b=document.getElementById('admin-mobile-nav'),out=document.getElementById('mobile-signout');
 if(a)a.hidden=!admin;if(b)b.hidden=!admin;if(out)out.hidden=!u;
 if(u){const result=await db.rpc('is_account_banned');if(result.data===true){await db.auth.signOut();alert('تم إيقاف هذا الحساب. تواصل مع الإدارة إذا كنت تعتقد أن هذا خطأ.');}}
}
db.auth.onAuthStateChange(()=>{setTimeout(()=>sync().catch(()=>{}),0)});
sync().catch(()=>{});
document.addEventListener('click',async e=>{
 const out=e.target.closest('#mobile-signout');if(!out)return;
 e.preventDefault();e.stopImmediatePropagation();await db.auth.signOut();window.location.reload();
},true);
})();