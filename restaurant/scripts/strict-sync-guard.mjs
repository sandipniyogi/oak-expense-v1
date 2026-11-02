// Identical copies live in each Docker build context. Never trust browser proof.
export const strictEnabled=()=>process.env.OAK_STRICT_SYNC==='1';
export function gateClient({env=process.env,fetcher=fetch}={}){
 const enabled=env.OAK_STRICT_SYNC==='1';
 async function request(route,body){
  if(!enabled)return {enabled:false};
  const url=new URL(env.OAK_STRICT_GATE_URL||'http://unconfigured.invalid');
  if(!['http:','https:'].includes(url.protocol)||!env.OAK_STRICT_GATE_TOKEN||!['mac','vps'].includes(env.OAK_STRICT_PEER))throw Error('Strict sync is not configured');
  const response=await fetcher(new URL(route,url),{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+env.OAK_STRICT_GATE_TOKEN,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Sync verification unavailable');
  // Rehearsal providers may NEVER authorize live environments.
  if(data.rehearsal===true&&env.OAK_STRICT_REHEARSAL!=='1')throw Error('Rehearsal proof is not valid for live writes');
  return data;
 }
 return {enabled,request};
}
export function gateMiddleware(options={}){
 const client=gateClient(options);
 return async function(req,res,next){
  if(req.path==='/strict-sync/status'&&req.method==='GET'){
   if(!client.enabled)return res.json({enabled:false,locked:false});
   try{return res.json(await client.request('/status'))}catch{return res.status(503).json({enabled:true,locked:true,error:'Sync verification unavailable'})}
  }
  // The button rechecks fixture state in the staging rehearsal. Live sync adapter
  // integration is intentionally unavailable in this patch.
  if(req.path==='/strict-sync/check'&&req.method==='POST'){
   if(!client.enabled)return res.status(409).json({error:'Strict sync is not enabled'});
   const env=options.env||process.env;
   if(env.OAK_STRICT_REHEARSAL!=='1')return res.status(423).json({error:'Live sync adapter is not installed'});
   if(req.headers['x-oak-sync-action']!=='check')return res.status(403).json({error:'Explicit sync action header required'});
   try{return res.json(await client.request('/sync',{}))}catch{return res.status(423).json({error:'Both peers must be online, approved and synchronized'})}
  }
  if(!client.enabled||['GET','HEAD','OPTIONS'].includes(req.method))return next();
  let permit;
  try{permit=await client.request('/acquire',{});if(!permit.id||permit.peer!==(options.env||process.env).OAK_STRICT_PEER)throw Error('Missing or wrong-peer write permit')}
  catch{return res.status(423).json({code:'STRICT_SYNC_LOCKED',error:'Changes are locked. Both Mac live and VPS must be online and verified. Check & Sync before retrying.'})}
  let done=false;
  const finish=uncertain=>{if(done)return;done=true;void client.request('/complete',{id:permit.id,uncertain}).catch(()=>{/* Coordinator remains dirty/active. Never retry a mutation here. */})};
  res.once('finish',()=>finish(false));res.once('close',()=>finish(!res.writableFinished));
  next();
 };
}
