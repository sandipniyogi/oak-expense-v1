const fs=require('fs'),https=require('https'),http=require('http'),path=require('path');
const root=path.join(__dirname,'public');
const api=new URL(process.env.API_URL||'http://api:4000');
const certDir=process.env.TLS_CERT_DIR||'/certs';
const queueEnv=process.env.QUEUE_ENV==='live'?'live':'staging';
const staticFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css','/sw.js':'sw.js','/manifest.webmanifest':'manifest.webmanifest','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const cloud=process.env.QUEUE_CLOUD==='1';
const handler=(req,res)=>{
  const url=new URL(req.url,'https://phone.local');
  if(url.pathname==='/config.js' && req.method==='GET'){
    res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    return res.end(`window.OAK_QUEUE_ENV=${JSON.stringify(queueEnv)};window.OAK_QUEUE_CLOUD=${JSON.stringify(cloud)};`);
  }
  if(url.pathname==='/manifest.webmanifest' && req.method==='GET'){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
    if(queueEnv==='live'){manifest.name='Oak Live Receipt Queue';manifest.short_name='Oak Live';}
    if(cloud){manifest.start_url='./';manifest.scope='./';manifest.id='./';for(const icon of manifest.icons)icon.src=icon.src.replace(/^\//,'');}
    res.writeHead(200,{'Content-Type':'application/manifest+json','Cache-Control':'no-cache'});return res.end(JSON.stringify(manifest));
  }
  if(url.pathname.startsWith('/api/')){
    const route=url.pathname.slice(4);
    const allowed=(req.method==='POST'&&(route==='/ocr'||route==='/attachments'||route==='/expenses'))||(req.method==='GET'&&(route==='/meta'||route==='/health'));
    if(!allowed){res.writeHead(404);return res.end('Not found');}
    const headers={...req.headers,host:api.host};delete headers.origin;
    const upstream=http.request({hostname:api.hostname,port:api.port||80,method:req.method,path:route+url.search,headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Expense API is unavailable'}));});
    req.on('aborted',()=>upstream.destroy());req.pipe(upstream);return;
  }
  const name=staticFiles[url.pathname];
  if(!name||req.method!=='GET'){res.writeHead(404);return res.end('Not found');}
  const data=fs.readFileSync(path.join(root,name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
};
const server=cloud?http.createServer(handler):https.createServer({key:fs.readFileSync(path.join(certDir,'server.key')),cert:fs.readFileSync(path.join(certDir,'server.crt'))},handler);
server.listen(cloud?8080:3443,'0.0.0.0',()=>console.log(`Oak ${queueEnv} phone queue ready`));
