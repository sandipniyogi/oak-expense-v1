// This provider is a test fixture, not an actual Mac/VPS liveness assertion.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Coordinator} from './coordinator.mjs';
import {createServer} from './server.mjs';
export function fixtureProvider(file){return {rehearsal:true,async sync(){},async inspect(nonce){return {...JSON.parse(fs.readFileSync(file,'utf8')),nonce}}};}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.env.OAK_STRICT_REHEARSAL!=='1')throw Error('Rehearsal requires explicit staging opt-in');
 const folder=process.env.OAK_GATE_STATE_DIR;if(!folder)throw Error('State directory required');
 const coordinator=new Coordinator({stateFile:path.join(folder,'state.json'),provider:fixtureProvider(path.join(folder,'fixture.json'))});
 createServer({coordinator,tokens:{mac:process.env.OAK_GATE_MAC_TOKEN,vps:process.env.OAK_GATE_VPS_TOKEN}}).listen(Number(process.env.PORT||4780),'127.0.0.1',()=>console.log('Strict-sync REHEARSAL on localhost only; production unlocking is unavailable.'));
}
