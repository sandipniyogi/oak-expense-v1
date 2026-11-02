// Rehearsal adapter: explicitly injected SQLite connection and disposable storage.
// Do not wire into the live restaurant until single-writer ownership is enforced.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {writer} from './sqlite-write-barrier.mjs';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function durableFile(file,bytes){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
function syncDir(folder){const fd=fs.openSync(folder,'r');try{fs.fsyncSync(fd)}finally{fs.closeSync(fd)}}
export function permitStore({db,root,peer,checkpoint=()=>{},receiptTable='test_upload_receipts',mediaDirectory='media'}){
 if(!/^[a-z_]+$/.test(receiptTable)||!['media','uploads'].includes(mediaDirectory))throw Error('Invalid store identifiers');
 if(!['mac','vps'].includes(peer))throw Error('Peer required');
 const writes=writer(db);const media=path.join(root,mediaDirectory),pending=path.join(root,'pending'),quarantine=path.join(root,'quarantine');
 for(const dir of [root,media,pending,quarantine]){fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.lstatSync(dir).isSymbolicLink())throw Error('Symlink storage refused')}
 function claimOK(claim){if(claim?.peer!==peer||claim.mode!=='application'||claim.closed||!/^[a-f0-9-]{36}$/i.test(claim.id||''))throw Error('Wrong, closed or missing claim');if(fs.readdirSync(pending).length)throw Error('Recovery required before another write')}
 function mutate(claim,fn){claimOK(claim);return writes.transaction(claim,fn)}
 function upload(claim,bytes,onUpload=()=>{}){
  claimOK(claim);if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8*1024*1024)throw Error('Invalid upload');
  let ext;if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')ext='webp';else throw Error('Unsupported image');
  const hash=digest(bytes),name=hash+'.'+ext,final=path.join(media,name),journal=path.join(pending,claim.id+'.json');
  // The persisted intent remains until both immutable file and SQL receipt commit.
  let result;
  writes.transaction(claim,()=>{
   if(db.prepare(`SELECT id FROM ${receiptTable} WHERE id=?`).get(claim.id))throw Error('Operation already used');
   const existed=fs.existsSync(final);
   if(existed&&(fs.lstatSync(final).isSymbolicLink()||digest(fs.readFileSync(final))!==hash))throw Error('Existing media mismatch');
   durableFile(journal,JSON.stringify({version:1,id:claim.id,name,hash,created:!existed}));syncDir(pending);checkpoint('intent');
   if(!existed){durableFile(final,bytes);syncDir(media)}checkpoint('file');
   db.prepare(`INSERT INTO ${receiptTable}(id,name,hash) VALUES(?,?,?)`).run(claim.id,name,hash);result={name,hash};const callbackResult=onUpload(result);if(callbackResult&&typeof callbackResult.then==='function')throw Error('Upload audit callback must be synchronous');
  });
  checkpoint('commit');fs.unlinkSync(journal);syncDir(pending);return result;
 }
 function recover(){
  // Trusted recovery only. It never grants a permit or changes the fence.
  const state=db.prepare('SELECT frozen,operation FROM oak_test_fence').get();if(!state.frozen||state.operation)throw Error('Freeze SQLite before recovery');
  const report=[];
  for(const entry of fs.readdirSync(pending)){
   if(!/^[a-f0-9-]{36}\.json$/i.test(entry))throw Error('Unknown recovery file');
   const journal=path.join(pending,entry);if(fs.lstatSync(journal).isSymbolicLink())throw Error('Symlink journal refused');const item=JSON.parse(fs.readFileSync(journal));
   if(item.version!==1||entry!==item.id+'.json'||!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(item.name)||item.name.split('.')[0]!==item.hash||typeof item.created!=='boolean')throw Error('Invalid recovery record');
   const final=path.join(media,item.name);const receipt=db.prepare(`SELECT name,hash FROM ${receiptTable} WHERE id=?`).get(item.id);
   if(receipt){if(receipt.name!==item.name||receipt.hash!==item.hash||!fs.existsSync(final)||fs.lstatSync(final).isSymbolicLink()||digest(fs.readFileSync(final))!==item.hash)throw Error('Committed upload needs manual repair');report.push({id:item.id,status:'committed'});}
   else if(item.created&&fs.existsSync(final)){
    if(db.prepare(`SELECT id FROM ${receiptTable} WHERE name=?`).get(item.name))throw Error('Unexpected file reference; manual recovery required');
    if(fs.lstatSync(final).isSymbolicLink()||digest(fs.readFileSync(final))!==item.hash)throw Error('Uncommitted media mismatch');
    const target=path.join(quarantine,item.id+'-'+item.name);if(fs.existsSync(target))throw Error('Quarantine collision');fs.renameSync(final,target);syncDir(media);syncDir(quarantine);report.push({id:item.id,status:'quarantined'});
   }else report.push({id:item.id,status:'no-new-file'});
   fs.unlinkSync(journal);syncDir(pending);
  }return report;
 }
 return {mutate,upload,recover};
}
