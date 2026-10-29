import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.env.DATA_DIR||'/data',temp=path.join(root,'backup-'+crypto.randomUUID()+'.sqlite');
const db=new DatabaseSync(path.join(root,'restaurant.sqlite'));
try{await backup(db,temp);process.stdout.write(fs.readFileSync(temp));}finally{db.close();if(fs.existsSync(temp))fs.unlinkSync(temp);}
