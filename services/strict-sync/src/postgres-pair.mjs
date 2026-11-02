import crypto from 'node:crypto';
const peers=['mac','vps'];
export class PostgresPair {
 constructor(pools){if(peers.some(p=>!pools[p]))throw Error('Both administrative pools required');this.pools=pools;}
 async transaction(peer,sql,args=[]){
  const client=await this.pools[peer].connect();
  try{await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='15000'");await client.query("SET LOCAL lock_timeout='12000'");const result=await client.query(sql,args);await client.query('COMMIT');return result}
  catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
 }
 async freeze(){const results=await Promise.allSettled(peers.map(p=>this.transaction(p,'SELECT oak_guard.freeze() AS generation')));if(results.some(x=>x.status==='rejected'))throw Error('Could not freeze both databases');}
 async begin(id,mode){
  if(!['application','synchronization'].includes(mode))throw Error('Invalid permit mode');
  const fn=mode==='application'?'begin_application':'begin_synchronization';
  const results=await Promise.allSettled(peers.map(peer=>this.transaction(peer,`SELECT oak_guard.${fn}($1::uuid) AS generation`,[id])));
  if(results.some(x=>x.status==='rejected')){try{await this.freeze()}catch{}throw Error('Paired database permit failed; no application permit returned');}
  return Object.fromEntries(peers.map((peer,i)=>[peer,{id,peer,mode,generation:String(results[i].value.rows[0].generation)}]));
 }
}
