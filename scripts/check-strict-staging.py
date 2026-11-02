#!/usr/bin/env python3
"""Read-only checks of staging lock status. Does not submit business mutations."""
import json,urllib.request,urllib.error
paths=['http://localhost:4100/strict-sync/status']+['http://localhost:3100/module-api/'+m+'/strict-sync/status' for m in ['inventory','keg','social','ai']]
for url in paths:
 try:
  with urllib.request.urlopen(url,timeout=10) as response:status=response.status;data=json.load(response)
 except urllib.error.HTTPError as e:
  status=e.code;data=json.load(e)
 if status!=503 or data.get('enabled') is not True or data.get('locked') is not True:
  raise SystemExit('FAIL: expected unconfigured strict lock at '+url)
 print('PASS locked:',url)
print('PASS: all five staging APIs report locked without a coordinator. No mutation was attempted. Production locking/sync is not installed.')
