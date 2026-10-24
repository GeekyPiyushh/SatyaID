"""Start only a dedicated synthetic Compose project with ephemeral process-local keys.
No secrets are printed or written. Stop services without removing volumes after checks.
"""
import json, os, secrets, subprocess, urllib.request, time
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env = dict(os.environ, DOCKER_CONFIG='/tmp/satyaid-docker-config', API_PORT='3034')
for name in ['JWT_SECRET','CSRF_SECRET']:
    env[name] = secrets.token_hex(40)
import base64
for name in ['UPLOAD_ENCRYPTION_KEY','APAAR_ENCRYPTION_KEY','APAAR_LOOKUP_KEY']:
    env[name] = base64.b64encode(secrets.token_bytes(32)).decode()
# Build first: docker build -t satyaid:batch4 . (runner proxy options may be required).
for service in ['api','indexes','worker']:
    subprocess.run(['docker','tag','satyaid:batch4','satyaid-batch4-smoke-'+service],env=env,check=True)
cmd = ['docker','compose','-p','satyaid-batch4-smoke']
def run(args):
    subprocess.run(cmd + args, cwd=root, env=env, check=True)
try:
    run(['up','-d','--no-build','--wait','--wait-timeout','90'])
    for path in ['/api/health','/api/ready']:
        with urllib.request.urlopen('http://127.0.0.1:3034'+path) as r:
            assert r.status == 200
            assert json.load(r)['success'] is True
    req = urllib.request.Request('http://127.0.0.1:3034/api/v1/auth/browser/csrf',data=b'{}',headers={'Origin':'http://localhost:5173','Content-Type':'application/json'})
    with urllib.request.urlopen(req) as r:
        assert 'HttpOnly' in r.headers.get('Set-Cookie','')
        assert json.load(r)['data']['csrfToken']
    run(['exec','-T','worker','node','dist/worker.js','--once'])
    print('PASS: Compose API health, replica readiness, browser CSRF, compiled worker once')
finally:
    run(['stop','--timeout','30'])
