import {operationContext,validateClaim} from './transaction-context.mjs';
// Application code must use a NON-superuser role which does not own oak_guard.
// Coordinator/freeze/sync-control queries use a separate administrative pool.
function command(text){
 let s=text.trim();
 while(s.startsWith('--')||s.startsWith('/*')){
  if(s.startsWith('--')){const n=s.indexOf('\n');s=n<0?'':s.slice(n+1).trimStart();}
  else{let depth=1,i=2;for(;i<s.length&&depth;i++){if(s.slice(i,i+2)==='/*'){depth++;i++}else if(s.slice(i,i+2)==='*/'){depth--;i++}}if(depth)throw Error('Unterminated SQL comment');s=s.slice(i).trimStart();}
 }
 s=s.replace(/;\s*$/,'');if(s.includes(';'))throw Error('Strict pool requires one SQL statement per query');
 if(/^(BEGIN|START\s+TRANSACTION)\b/i.test(s))return 'begin';
 if(/^(COMMIT|END)(?:\s+(?:WORK|TRANSACTION))?$/i.test(s))return 'commit';
 if(/^(ROLLBACK|ABORT)(?:\s+(?:WORK|TRANSACTION))?$/i.test(s))return 'rollback';
 if(/^(COMMIT|END|ROLLBACK|ABORT)\b/i.test(s)&&!/^ROLLBACK\s+TO\b/i.test(s))throw Error('Unsupported transaction command');
 if(/^(SET|RESET|DISCARD|PREPARE\s+TRANSACTION)\b/i.test(s))throw Error('Session settings must be managed by the strict pool');
 return 'query';
}
function queryText(args){if(typeof args[0]==='string')return args[0];if(args[0]&&typeof args[0].text==='string')return args[0].text;throw Error('SQL text required');}
function assertPromiseArgs(args){if(args.some(x=>typeof x==='function'))throw Error('Strict pool uses Promise-based queries only');}
export function fencedClient(client,claim){
 let active=false,released=false,tail=Promise.resolve();const rawQuery=client.query.bind(client),rawRelease=client.release.bind(client);
 async function initialize(){
  if(!claim){await rawQuery('SET TRANSACTION READ ONLY');return;}
  validateClaim(claim);
  await rawQuery("SELECT set_config('oak_guard.operation',$1,true),set_config('oak_guard.generation',$2,true),set_config('oak_guard.mode',$3,true)",[claim.id,String(claim.generation),claim.mode]);
 }
 async function rollback(){try{await rawQuery('ROLLBACK')}finally{active=false}}
 async function execute(args){
  const kind=command(queryText(args));
  if(kind==='rollback'){if(!active)throw Error('No active transaction');return rollback();}
  if(claim)validateClaim(claim);
  if(kind==='begin'){
   if(active)throw Error('Nested BEGIN is not supported');
   await rawQuery(...args);active=true;
   try{await initialize();return undefined}catch(e){await rollback();throw e}
  }
  if(kind==='commit'){
   if(!active)throw Error('No active transaction');
   try{return await rawQuery(...args)}catch(e){await rollback();throw e}finally{active=false}
  }
  if(active)return rawQuery(...args);
  await rawQuery('BEGIN');active=true;
  try{await initialize();const result=await rawQuery(...args);await rawQuery('COMMIT');active=false;return result}
  catch(e){try{await rollback()}catch{}throw e}
 }
 return {
  query(...args){if(released)return Promise.reject(Error('Client is released'));try{assertPromiseArgs(args)}catch(e){return Promise.reject(e)}const result=tail.then(()=>execute(args));tail=result.catch(()=>{});return result;},
  release(error){if(released)return;released=true;void tail.then(async()=>{try{if(active)await rollback();rawRelease(error)}catch(e){rawRelease(e)}});}
 };
}
export function fencedPool(pool,{enabled=true,peer=process.env.OAK_STRICT_PEER}={}){
 if(!enabled)return pool;
 function claimForPeer(){const claim=operationContext.getStore();if(claim){validateClaim(claim);if(!['mac','vps'].includes(peer)||claim.peer!==peer)throw Error('Database pool peer binding mismatch')}return claim;}
 return new Proxy(pool,{get(target,key){
  if(key==='connect')return async(...args)=>{assertPromiseArgs(args);if(args.length)throw Error('Unsupported connect arguments');const claim=claimForPeer();return fencedClient(await target.connect(),claim)};
  if(key==='query')return async(...args)=>{assertPromiseArgs(args);if(command(queryText(args))!=='query')throw Error('Explicit transactions require pool.connect()');const claim=claimForPeer();const client=fencedClient(await target.connect(),claim);try{return await client.query(...args)}finally{client.release()}};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
