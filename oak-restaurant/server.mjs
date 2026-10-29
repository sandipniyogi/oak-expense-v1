import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));};
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
export function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){return 'scrypt:'+salt+':'+crypto.scryptSync(password,salt,64).toString('hex');}
function checkPassword(password,hash){const [alg,salt,expected]=String(hash).split(':');if(alg!=='scrypt'||!salt||!/^[a-f0-9]{128}$/.test(expected||''))return false;return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(expected,'hex'));}
function text(v,max=3000){if(typeof v!=='string'||v.length>max)throw Error('Invalid text field');return v.trim();}
function asset(v){if(!v)return '';if(/^\/media\/[a-f0-9-]+\.(jpg|png|webp)$/.test(v)||/^\/assets\/[a-z0-9-]+\.(jpg|webp|png)$/.test(v))return v;throw Error('Use an image uploaded through this panel');}
function url(v){if(!v)return '';const u=new URL(v);if(u.protocol!=='https:')throw Error('Booking links must use HTTPS');return u.toString();}
function date(v){if(!v)return null;const n=Date.parse(v);if(!Number.isFinite(n))throw Error('Invalid date');return new Date(n).toISOString();}
const DEFAULTS={name:'The Oak Lounge',city:'Shanghai',eyebrow:'FOOD · MUSIC · CULTURE · TOGETHER',hero_title:'Bengali soul.\nShanghai nights.',hero_text:'Come for the flavours. Stay for the conversation. Bengali cuisine, cocktails and shisha, brought together at The Oak Lounge.',about_title:'Rooted in Bengal.\nMade for together.',about_text:'Some evenings deserve a little more time. A table to share, a drink to savour, and a familiar place to come back to. Welcome to The Oak Lounge, Shanghai.',address:'',hours:'',phone:'',wechat:'',booking_url:'',instagram_url:'',announcement:'',announcement_link:'',logo_url:'/assets/oak-logo.jpg',hero_image:'/assets/oak-hero.png',wechat_qr:''};
async function body(req,max=65536){const chunks=[];let size=0;for await(const b of req){size+=b.length;if(size>max)throw Object.assign(Error('Request too large'),{status:413});chunks.push(b);}return Buffer.concat(chunks);}
export function createApp({dataDir=process.env.DATA_DIR||path.join(HERE,'data'),passwordHash=process.env.ADMIN_PASSWORD_HASH,secure=process.env.NODE_ENV==='production',origin=process.env.PUBLIC_ORIGIN||'',clock=()=>Date.now(),rateLimit=10,cookieName=process.env.ADMIN_COOKIE_NAME||'oak_admin',environment=process.env.APP_ENV||'production'}={}){
 if(!/^[a-zA-Z0-9_]{1,60}$/.test(cookieName))throw Error('Invalid admin cookie name');
 if(!passwordHash)throw Error('ADMIN_PASSWORD_HASH is required. Run the setup script; never place a plaintext password in source.');
 fs.mkdirSync(path.join(dataDir,'uploads'),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path.join(dataDir,'restaurant.sqlite'));db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
 db.exec(`CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS menu(id TEXT PRIMARY KEY,category TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price_cents INTEGER,tags TEXT NOT NULL DEFAULT '[]',image TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,available INTEGER NOT NULL DEFAULT 1,sort_order INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',start_at TEXT,end_at TEXT,publish_at TEXT,image TEXT NOT NULL DEFAULT '',published INTEGER NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,booking_url TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,record_id TEXT,created_at TEXT NOT NULL);`);
 if(!db.prepare('SELECT id FROM settings WHERE id=1').get()){
  db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify(DEFAULTS));
  for(const [category,name,description] of [['food','Your signature Bengali dish','Draft example. Replace this with your real dish, description, price and photograph.'],['cocktails','Your signature cocktail','Draft example. Add your real ingredients and price.'],['shisha','Your house shisha blend','Draft example. Add your actual flavours, strength and price.']])db.prepare('INSERT INTO menu(id,category,name,description,updated_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),category,name,description,new Date(clock()).toISOString());
  db.prepare('INSERT INTO events(id,title,description,updated_at) VALUES(?,?,?,?)').run(crypto.randomUUID(),'Your next Oak evening','Draft example. Add your real event, date and poster before publishing.',new Date(clock()).toISOString());
 }
 const failures=new Map();
 function audit(action,id=''){db.prepare('INSERT INTO audit(action,record_id,created_at) VALUES(?,?,?)').run(action,id,new Date(clock()).toISOString());}
 function settings(){return {...DEFAULTS,...JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data)};}
 function content(preview=false){const now=new Date(clock()).toISOString();return {environment,settings:settings(),menu:db.prepare('SELECT * FROM menu '+(preview?'':'WHERE published=1')+' ORDER BY sort_order,name').all().map(x=>({...x,tags:JSON.parse(x.tags)})),events:db.prepare('SELECT * FROM events '+(preview?'':'WHERE published=1 AND (publish_at IS NULL OR publish_at<=?)')+' ORDER BY pinned DESC, start_at').all(...(preview?[]:[now])).filter(e=>preview||Date.parse(e.end_at||new Date(Date.parse(e.start_at)+12*3600000).toISOString())>=clock()),preview};}
 function auth(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!token)return null;return db.prepare('SELECT * FROM sessions WHERE id=? AND expires_at>?').get(digest(token),clock());}
 function sourceOK(req){if(!req.headers.origin)return false;try{const o=new URL(req.headers.origin);if(origin)return o.origin===new URL(origin).origin;return o.host===req.headers.host;}catch{return false;}}
 function headers(res){res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");}
 async function handler(req,res){headers(res);let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://oak.local').pathname);}catch{return json(res,400,{error:'Invalid URL'});}
 try{
  if(req.method==='GET'&&pathname==='/api/health')return json(res,200,{ok:true});
  if(req.method==='GET'&&pathname==='/api/content')return json(res,200,content());
  if(req.method==='POST'&&pathname==='/api/admin/login'){
   if(!sourceOK(req))return json(res,403,{error:'Invalid request origin'});
   const ip=req.socket.remoteAddress||'local';const prev=failures.get(ip);const recent=prev&&clock()-prev.at<15*60000?prev:{count:0,at:clock()};
   if(recent.count>=rateLimit)return json(res,429,{error:'Too many attempts. Try again in 15 minutes.'});
   const q=JSON.parse((await body(req)).toString());if(q.username!=='admin'||typeof q.password!=='string'||q.password.length>1024||!checkPassword(q.password,passwordHash)){recent.count++;failures.set(ip,recent);return json(res,401,{error:'Incorrect username or password'});}
   failures.delete(ip);db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(clock());
   const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),csrf,clock()+12*3600000);audit('login');
   return json(res,200,{ok:true,csrf},{'Set-Cookie':`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${secure?'; Secure':''}`});
  }
  if(pathname.startsWith('/api/admin/')){
   const session=auth(req);if(!session)return json(res,401,{error:'Please sign in'});
   if(req.method==='GET'&&pathname==='/api/admin/session')return json(res,200,{username:'admin',csrf:session.csrf});
   if(req.method==='GET'&&pathname==='/api/admin/content')return json(res,200,{...content(true),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 30').all()});
   if(!sourceOK(req)||req.headers['x-csrf-token']!==session.csrf)return json(res,403,{error:'Invalid request verification token'});
   if(req.method==='POST'&&pathname==='/api/admin/logout'){db.prepare('DELETE FROM sessions WHERE id=?').run(session.id);return json(res,200,{ok:true},{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`});}
   if(req.method==='POST'&&pathname==='/api/admin/upload'){
    const bytes=await body(req,8*1024*1024);let ext;
    if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
    else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';
    else if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')ext='webp';
    else return json(res,400,{error:'Upload a JPG, PNG or WebP image (maximum 8 MB). SVG and documents are not accepted.'});
    const name=digest(bytes)+'.'+ext;fs.writeFileSync(path.join(dataDir,'uploads',name),bytes,{mode:0o600});audit('image.upload',name);return json(res,201,{url:'/media/'+name});
   }
   const q=JSON.parse((await body(req)).toString()||'{}');
   if(req.method==='PUT'&&pathname==='/api/admin/settings'){
    const next={...settings()};for(const key of Object.keys(DEFAULTS))if(Object.hasOwn(q,key))next[key]=text(q[key],key.endsWith('text')?6000:1000);
    for(const key of ['logo_url','hero_image','wechat_qr'])next[key]=asset(next[key]);for(const key of ['booking_url','instagram_url','announcement_link'])next[key]=url(next[key]);
    if(next.phone&&!/^[+\d\s()\-]{5,35}$/.test(next.phone))throw Error('Invalid phone number');
    db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(next));audit('settings.update');return json(res,200,{ok:true});
   }
   const match=pathname.match(/^\/api\/admin\/(menu|events)(?:\/([a-f0-9-]{36}))?$/);if(!match)return json(res,404,{error:'Not found'});
   const [,table,id]=match;
   if(req.method==='DELETE'&&id){const result=db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);if(!result.changes)return json(res,404,{error:'Not found'});audit(table+'.delete',id);return json(res,200,{ok:true});}
   if(!['POST','PUT'].includes(req.method)||((req.method==='PUT')!==Boolean(id)))return json(res,405,{error:'Method not allowed'});
   if(id&&!db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id))return json(res,404,{error:'Not found'});
   const rid=id||crypto.randomUUID(),updated=new Date(clock()).toISOString();
   if(table==='menu'){
    if(!['food','cocktails','shisha'].includes(q.category))throw Error('Choose a valid menu category');
    const name=text(q.name,140);if(!name)throw Error('Item name is required');
    const price=q.price===''||q.price==null?null:Number(q.price);if(price!=null&&(!Number.isFinite(price)||price<0||price>100000||Math.abs(price*100-Math.round(price*100))>0.000001))throw Error('Enter a valid price with up to two decimal places');
    if(q.published&&price==null)throw Error('Add the real price before publishing a menu item');
    const tags=Array.isArray(q.tags)?q.tags.slice(0,6).map(x=>text(x,40)):[];const order=Number(q.sort_order||0);if(!Number.isInteger(order)||Math.abs(order)>10000)throw Error('Invalid sort order');
    db.prepare(`INSERT INTO menu VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET category=excluded.category,name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,tags=excluded.tags,image=excluded.image,published=excluded.published,available=excluded.available,sort_order=excluded.sort_order,updated_at=excluded.updated_at`).run(rid,q.category,name,text(q.description||'',2000),price==null?null:Math.round(price*100),JSON.stringify(tags),asset(q.image),q.published?1:0,q.available===false?0:1,order,updated);
   }else{
    const title=text(q.title,160);if(!title)throw Error('Event title is required');const start=date(q.start_at),end=date(q.end_at),pub=date(q.publish_at);if(end&&(!start||end<start))throw Error('Event end must follow its start');if(q.published&&!start)throw Error('Set an event date before publishing');
    db.prepare(`INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,publish_at=excluded.publish_at,image=excluded.image,published=excluded.published,pinned=excluded.pinned,booking_url=excluded.booking_url,updated_at=excluded.updated_at`).run(rid,title,text(q.description||'',5000),start,end,pub,asset(q.image),q.published?1:0,q.pinned?1:0,url(q.booking_url),updated);
   }
   audit(table+(q.published?'.publish':'.save'),rid);return json(res,id?200:201,{ok:true,id:rid});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
  let file;
  if(pathname.startsWith('/media/')){if(!/^\/media\/[a-f0-9]+\.(png|jpg|webp)$/.test(pathname))return json(res,404,{error:'Not found'});file=path.join(dataDir,'uploads',path.basename(pathname));}
  else{const name=pathname==='/'?'index.html':pathname==='/admin'||pathname==='/admin/'?'admin.html':pathname.slice(1);file=path.resolve(HERE,'public',name);if(!file.startsWith(path.join(HERE,'public')+path.sep))return json(res,404,{error:'Not found'});}
  if(!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'Not found'});
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':path.extname(file)==='.html'?'no-cache':'public, max-age=3600'});if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
 }catch(e){return json(res,e.status||400,{error:e instanceof SyntaxError?'Invalid request data':e.message});}}
 const server=http.createServer(handler);return {server,db,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const app=createApp();app.server.listen(Number(process.env.PORT||3080),'0.0.0.0',()=>console.log('Oak restaurant listening on '+(process.env.PORT||3080)));}catch(e){console.error(e.message);process.exit(1);}
}
