#!/usr/bin/env python3
"""Loopback-only persistent local replication rehearsal, never a live connector."""
import argparse,importlib.util,json,pathlib,secrets,threading
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
root=pathlib.Path(__file__).resolve().parents[1];spec=importlib.util.spec_from_file_location('oak_sync_preview',root/'automation/sync_preview/engine.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--port',type=int,default=3190);a=p.parse_args();folder=root/'backups/sync-preview-v1'
 for path in [folder,*folder.parents]:
  if path==root:break
  if path.is_symlink():raise SystemExit('Symlink data path refused')
 folder.mkdir(parents=True,exist_ok=True);marker=folder/'REHEARSAL-ONLY'
 if not marker.exists():
  if list(folder.iterdir()):raise SystemExit('Existing unmarked folder refused')
  marker.write_text('Oak local demo records only\n')
 if marker.read_text()!='Oak local demo records only\n':raise SystemExit('Unexpected rehearsal marker')
 if any(path.is_symlink() for path in folder.iterdir()):raise SystemExit('Symlink store refused')
 engine=module.Engine(folder);token=secrets.token_hex(32);page=(root/'automation/sync_preview/page.html').read_text().replace('__TOKEN__',token)
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def send(self,status,data,kind='application/json'):
   raw=(json.dumps(data) if kind=='application/json' else data).encode();self.send_response(status);self.send_header('Content-Type',kind+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
  def valid_host(self):return self.headers.get('Host')=='127.0.0.1:'+str(server.server_port)
  def do_GET(self):
   if not self.valid_host():return self.send(403,{'error':'Use the printed loopback URL'})
   if self.path=='/':return self.send(200,page,'text/html')
   if self.path=='/status':return self.send(200,engine.status())
   self.send(404,{'error':'Not found'})
  def do_POST(self):
   origin='http://127.0.0.1:'+str(server.server_port)
   if not self.valid_host() or self.headers.get('Origin')!=origin or self.headers.get('X-Oak-Rehearsal')!=token:return self.send(403,{'error':'Invalid local rehearsal request'})
   if self.path!='/action':return self.send(404,{'error':'Not found'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=16384:raise ValueError('Request too large or empty')
    data=json.loads(self.rfile.read(size));op=data.get('op')
    with engine.lock:
     if op=='sync':result=engine.sync(data.get('interrupt') is True)
     elif op=='recover':result=engine.recover()
     elif op=='edit':engine.edit(data['peer'],data['key'],data.get('value'),data.get('delete') is True);result={'saved':True}
     elif op=='switch':engine.switch(data['peer'],data['field'],data['value']);result={'fixture_changed':True}
     elif op=='resolve':engine.resolve(data['key'],data['source']);result={'selected':True,'next':'Check & Sync'}
     elif op=='conflict':
      if engine.state['pending']:raise module.Locked('Recovery required')
      for peer in ('mac','vps'):engine.edit(peer,'expense:demo-1',{'paid_by':'Sandip','description':peer+' independent demo edit','amount':100},force=True)
      result={'injected_fixture_conflict':True}
     else:raise ValueError('Unknown action')
    self.send(200,result)
   except module.Locked as e:self.send(423,{'error':str(e)})
   except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)})
   except Exception:self.send(500,{'error':'Rehearsal operation failed; inspect local test state before continuing'})
 server=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);server.daemon_threads=True
 print('Local rehearsal only — actual VPS is NOT connected.',flush=True);print('Open: http://127.0.0.1:'+str(server.server_port),flush=True);print('Demo stores:',folder,flush=True);print('Keep this terminal open. Ctrl+C stops the preview.',flush=True)
 try:server.serve_forever()
 except KeyboardInterrupt:pass
 finally:server.server_close();engine.close()
if __name__=='__main__':main()
