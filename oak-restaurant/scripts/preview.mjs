import {createApp,hashPassword} from '../server.mjs';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const folder=path.resolve('.preview');fs.mkdirSync(folder,{recursive:true,mode:0o700});const secret=path.join(folder,'password');if(!fs.existsSync(secret))fs.writeFileSync(secret,crypto.randomBytes(18).toString('base64url'),{mode:0o600});const password=fs.readFileSync(secret,'utf8');const app=createApp({dataDir:path.join(folder,'data'),passwordHash:hashPassword(password),secure:false});app.server.listen(Number(process.env.PORT||(process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:3000)),'0.0.0.0',()=>console.log('Oak design preview ready'));
