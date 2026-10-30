#!/usr/bin/env python3
"""Enable optional expense AI review on the existing Mac staging stack only."""
import json,pathlib,subprocess
root=pathlib.Path(__file__).resolve().parents[1]
args=['docker','compose','--env-file','.env.staging','-f','docker-compose.yml','-f','automation/compose.local.yaml','-f','docker-compose.ai.yml','-f','automation/compose.ai-staging.yaml']
result=subprocess.run(args+['config','--format','json'],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if result.returncode:raise SystemExit('Cannot resolve staging configuration. Check Docker and .env.staging; resolved secrets were not printed.')
config=json.loads(result.stdout)
if config.get('name')!='oak-expense-staging':raise SystemExit('Expected project oak-expense-staging. Refusing to start a different stack.')
print('Building expense AI STAGING only. Existing Ollama/model installation is reused.',flush=True)
subprocess.run(args+['up','-d','--build','api','web','oak-ai'],cwd=root,check=True)
print('Open http://localhost:3100. AI health normally uses http://localhost:4400/health (check AI_API_HOST_PORT if customized).')
