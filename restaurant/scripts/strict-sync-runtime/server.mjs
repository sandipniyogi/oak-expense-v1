import http from 'node:http';
import crypto from 'node:crypto';
import {Coordinator,Locked} from './coordinator.mjs';
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createServer({coordinator,tokens}) {
 if(!tokens?.mac||!tokens?.vps||tokens.mac.length<32||tokens.vps.length<32||tokens.mac===tokens.vps)throw Error('Distinct private peer tokens required');
 return http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const peer=['mac','vps'].find(p=>equal(req.headers.authorization,'Bearer '+tokens[p]));
  if(!peer)return send(401,{error:'Unauthorized'});
  try{
   const route=new URL(req.url,'http://internal').pathname;
   if(req.method==='GET'&&route==='/status')return send(200,coordinator.status());
   if(req.method!=='POST')return send(404,{error:'Not found'});
   const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>4096)return send(413,{error:'Request too large'});chunks.push(chunk)}
   const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');
   if(route==='/sync')return send(200,await coordinator.sync());
   if(route==='/acquire')return send(200,await coordinator.acquire(peer));
   if(route==='/complete')return send(200,await coordinator.complete(peer,body.id,body.uncertain===true));
   return send(404,{error:'Not found'});
  }catch(e){send(e instanceof Locked?423:503,{error:e instanceof Locked?e.code:'verification_unavailable'});}
 });
}
