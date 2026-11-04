// Deploy with a D1 binding named DB and a secret ACCESS_HASH (SHA-256 of access key).
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  const allowed=['https://jamesburtondrums-ops.github.io','https://checkdiesel.burtco.co.uk'];
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(allowed.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, PUT, OPTIONS';}
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowed.includes(origin))return reply({error:'Origin not allowed'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const key=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!key||key.length>200)return reply({error:'Enter your CheckDiesel access key'},401);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  let diff=digest.length^String(env.ACCESS_HASH||'').length;
  for(let i=0;i<digest.length;i++)diff|=digest.charCodeAt(i)^(env.ACCESS_HASH||'').charCodeAt(i);
  if(diff)return reply({error:'Incorrect access key'},401);
  if(new URL(request.url).pathname!=='/state')return reply({error:'Not found'},404);
  try{
   if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT revision,payload,saved_at FROM snapshots ORDER BY revision DESC LIMIT 1').first();
    return reply(row?{revision:row.revision,state:JSON.parse(row.payload),savedAt:row.saved_at}:{revision:0,state:null});
   }
   if(request.method!=='PUT')return reply({error:'Method not allowed'},405);
   const raw=await request.text();
   if(new TextEncoder().encode(raw).length>1800000)return reply({error:'Shared data exceeds the 1.8 MB snapshot limit. Contact support to expand storage.'},413);
   const {revision,state}=JSON.parse(raw);
   const arrayKeys=['rows','meters','plantMachines'],objectKeys=['mappings','accountMappings','transactionAllocations','vehicleDepartments'];
   if(!Number.isSafeInteger(revision)||revision<0||!state||arrayKeys.some(k=>!Array.isArray(state[k]))||objectKeys.some(k=>!state[k]||typeof state[k]!=='object'||Array.isArray(state[k])))return reply({error:'Invalid storage data'},400);
   if(state.rows.some(r=>!r||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(r.litres)||r.litres<=0))return reply({error:'Invalid dispense records'},400);
   const now=new Date().toISOString();
   const result=await env.DB.prepare('INSERT INTO snapshots(payload,saved_at) SELECT ?,? WHERE COALESCE((SELECT MAX(revision) FROM snapshots),0)=?').bind(JSON.stringify(state),now,revision).run();
   if(!result.meta.changes)return reply({error:'Another device saved changes. Reconnect to merge before saving.'},409);
   // Keep the latest 30 complete revisions as recovery points.
   await env.DB.prepare('DELETE FROM snapshots WHERE revision < ?').bind(result.meta.last_row_id-29).run();
   return reply({revision:result.meta.last_row_id,savedAt:now});
  }catch(error){return reply({error:'Storage request failed; your local data is retained.'},500);}
 }
};
