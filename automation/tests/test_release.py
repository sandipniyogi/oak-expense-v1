import unittest,tempfile,pathlib,tarfile,io,hashlib,base64,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from deploy import unpack
class ReleaseTests(unittest.TestCase):
 def payload(self,name,link=False):
  buf=io.BytesIO()
  with tarfile.open(fileobj=buf,mode='w:gz') as t:
   m=tarfile.TarInfo(name)
   if link:m.type=tarfile.SYMTYPE;m.linkname='/etc/shadow';t.addfile(m)
   else:m.size=1;t.addfile(m,io.BytesIO(b'x'))
  raw=buf.getvalue();return {'archive':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()}
 def test_traversal(self):
  with tempfile.TemporaryDirectory() as p:
   with self.assertRaisesRegex(RuntimeError,'Invalid release'):unpack(self.payload('apps/../../outside'),pathlib.Path(p))
 def test_secret_path(self):
  with tempfile.TemporaryDirectory() as p:
   with self.assertRaisesRegex(RuntimeError,'Invalid release'):unpack(self.payload('apps/api/.env'),pathlib.Path(p))
 def test_symlink(self):
  with tempfile.TemporaryDirectory() as p:
   with self.assertRaisesRegex(RuntimeError,'link/device'):unpack(self.payload('apps/link',True),pathlib.Path(p))
 def test_hash_mismatch(self):
  q=self.payload('apps/file');q['sha256']='bad'
  with tempfile.TemporaryDirectory() as p:
   with self.assertRaisesRegex(RuntimeError,'checksum'):unpack(q,pathlib.Path(p))
if __name__=='__main__':unittest.main()
