"""A source-only release manifest. Never include runtime credentials or data."""
import pathlib,hashlib,json
SKIP={'.preview','data','backups','node_modules','__pycache__','.git'}
def files(root):
 for p in sorted(root.rglob('*')):
  rel=p.relative_to(root)
  if not p.is_file() or any(x in SKIP or x in ('.backup.lock','.DS_Store') or x.startswith('._') or x.startswith('.env') or x.startswith('.local-') for x in rel.parts) or rel.as_posix()=='release.json':continue
  if p.is_symlink():raise RuntimeError('Symlinks are not allowed in a source release: '+rel.as_posix())
  yield p,rel.as_posix()
def inventory(root):return {rel:hashlib.sha256(p.read_bytes()).hexdigest() for p,rel in files(root)}
def fingerprint(root):return hashlib.sha256(json.dumps(inventory(root),sort_keys=True,separators=(',',':')).encode()).hexdigest()
