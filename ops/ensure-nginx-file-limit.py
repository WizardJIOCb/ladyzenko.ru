"""Repair a confirmed Nginx descriptor limit without restarting active connections."""
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

TARGET=65536
conf=Path('/etc/nginx/nginx.conf')
previous=conf.read_text()
match=re.search(r'^\s*worker_rlimit_nofile\s+(\d+)\s*;',previous,re.M)
if match and int(match[1])>=TARGET:
    print('Worker descriptor limit already sufficient.');raise SystemExit(0)
if '--apply' not in sys.argv:
    print('Confirmed repair target: worker_rlimit_nofile 65536; use --apply after reviewing the error.');raise SystemExit(0)
hard=int(subprocess.check_output(['systemctl','show','nginx','-p','LimitNOFILE','--value'],text=True).strip())
assert hard>=TARGET,'The service hard limit must be reviewed first'
backup=Path('/var/backups/new-ladyzenko')/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-nginx-fd')
backup.mkdir(mode=0o700)
shutil.copy2(conf,backup/'nginx.conf')
if match:updated=previous[:match.start()]+'worker_rlimit_nofile 65536;'+previous[match.end():]
else:
    updated,count=re.subn(r'(^worker_processes[^\n]*\n)',r'\1worker_rlimit_nofile 65536;\n',previous,count=1,flags=re.M)
    assert count==1,'Review the main-context placement first'
try:
    conf.write_text(updated)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    conf.write_text(previous)
    subprocess.run(['nginx','-t'],check=True,capture_output=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    raise
time.sleep(1)
workers=[]
for proc in Path('/proc').iterdir():
    if not proc.name.isdigit():continue
    try:
        command=(proc/'cmdline').read_bytes().replace(b'\0',b' ')
        if b'nginx: worker process' not in command or b'shutting down' in command:continue
        line=next(x for x in (proc/'limits').read_text().splitlines() if x.startswith('Max open files'))
        soft=int(line.split()[3]);workers.append({'pid':int(proc.name),'soft_limit':soft})
    except (FileNotFoundError,ProcessLookupError,PermissionError):continue
assert workers and all(p['soft_limit']>=TARGET for p in workers),'Verify active worker limits'
print('NGINX_FD_REPAIR',workers,'BACKUP',backup)
