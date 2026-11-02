import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export class Locked extends Error { constructor(code){super(code);this.code=code;this.status=423;} }
// One owner for both peers. Persist before returning a permit. Never expire an
// outstanding write and grant another: the first writer could still be running.
export class Coordinator {
 constructor({stateFile,provider}) {
  if(!provider||typeof provider.inspect!=='function'||typeof provider.sync!=='function')throw Error('Trusted provider required');
  this.file=stateFile;this.provider=provider;this.busy=false;
  this.state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{version:1,dirty:true,active:null,reason:'not_verified'};
  if(this.state.version!==1)throw Error('Unsupported coordinator state');
  if(this.state.active){this.state.reason='interrupted_write';this.state.dirty=true;this.persist();}
 }
 persist(){fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});const temp=this.file+'.'+crypto.randomUUID();let fd;
  try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(this.state));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,this.file);const dir=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(dir)}finally{fs.closeSync(dir)}}finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp)}catch{}}
 }
 async exclusive(fn){if(this.busy)throw new Locked('another_operation_in_progress');this.busy=true;try{return await fn()}finally{this.busy=false}}
 status(){return {enabled:true,locked:true,reason:this.state.reason,dirty:this.state.dirty,active:Boolean(this.state.active),rehearsal:this.provider.rehearsal===true};}
 async check(){const nonce=crypto.randomUUID();const p=await this.provider.inspect(nonce);
  if(!p||p.nonce!==nonce||p.mac?.online!==true||p.vps?.online!==true)throw new Locked('peer_offline_or_unverified');
  if(!/^[a-f0-9]{40}$/.test(p.approved||'')||p.mac.commit!==p.approved||p.vps.commit!==p.approved)throw new Locked('approved_code_mismatch');
  if(p.complete!==true||!p.mac.digest||p.mac.digest!==p.vps.digest)throw new Locked('data_mismatch_or_incomplete_scope');
  return p;
 }
 async sync(){return this.exclusive(async()=>{
  if(this.state.active)throw new Locked('write_still_active_or_uncertain');
  // Dirty is kept on ANY failure, including network failure and provider error.
  this.state.dirty=true;this.state.reason='checking_and_syncing';this.persist();
  try{await this.provider.sync();await this.check();this.state.dirty=false;this.state.reason='verified_next_write_requires_fresh_check';this.persist();return {ok:true,rehearsal:this.provider.rehearsal===true}}
  catch(e){this.state.reason=e instanceof Locked?e.code:'verification_unavailable';this.persist();throw e}
 })}
 async acquire(peer){return this.exclusive(async()=>{
  if(!['mac','vps'].includes(peer))throw new Locked('invalid_peer');
  if(this.state.active)throw new Locked('write_still_active_or_uncertain');
  if(this.state.dirty)throw new Locked('sync_required');
  try{await this.check()}catch(e){this.state.dirty=true;this.state.reason=e instanceof Locked?e.code:'verification_unavailable';this.persist();throw e}
  const id=crypto.randomUUID();this.state.active={id,peer};this.state.dirty=true;this.state.reason='write_in_progress';this.persist();
  return {id,peer,rehearsal:this.provider.rehearsal===true};
 })}
 async complete(peer,id,uncertain=false){return this.exclusive(async()=>{
  if(this.state.active?.id!==id||this.state.active?.peer!==peer)throw new Locked('invalid_write_completion');
  this.state.dirty=true;
  if(uncertain){this.state.reason='uncertain_write_manual_recovery_required';}
  else{this.state.active=null;this.state.reason='sync_required_after_write';}
  this.persist();return {ok:true,locked:true};
 })}
}
