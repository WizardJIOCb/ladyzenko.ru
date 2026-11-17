"""Prepare ladyzenko.ru and activate HTTPS only after its DNS reaches this host."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

IP='82.146.42.213'
DOMAIN='ladyzenko.ru'
WEBROOT=Path('/var/www/new-ladyzenko-acme')
CONF=Path('/etc/nginx/sites-available/ladyzenko.ru.conf')
STATE=Path('/var/lib/new-ladyzenko-commerce')
MARKER='# Managed by ladyzenko-domain activation'

def run(*args):
    return subprocess.run(args,check=True,capture_output=True,text=True,timeout=300).stdout

def dns(server,kind):
    out=run('dig','@'+server,DOMAIN,kind,'+noall','+answer','+comments','+time=4','+tries=1')
    if 'status: NOERROR' not in out: return None
    return {line.split()[-1] for line in out.splitlines() if line and not line.startswith(';') and len(line.split())>=5 and line.split()[3]==kind}

def http_config():
    return MARKER+'''
server {
    listen 80;
    server_name ladyzenko.ru;
    include /etc/nginx/snippets/incident-sensitive-paths.conf;
    location ^~ /.well-known/acme-challenge/ { root /var/www/new-ladyzenko-acme; }
    location / { return 302 https://new.ladyzenko.ru$request_uri; }
}
'''

def https_config():
    text=MARKER+'''
server {
    listen 80;
    server_name ladyzenko.ru;
    location ^~ /.well-known/acme-challenge/ { root /var/www/new-ladyzenko-acme; }
    location / { return 301 https://ladyzenko.ru$request_uri; }
}
server {
    listen 443 ssl;
    server_name ladyzenko.ru;
    client_max_body_size 9m;
    ssl_certificate /etc/letsencrypt/live/ladyzenko.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ladyzenko.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/incident-sensitive-paths.conf;
    include /etc/nginx/new-ladyzenko-consumer.inc;
    location ^~ /commerce-private/ {
        internal;
        alias /var/lib/new-ladyzenko-commerce/media/;
        add_header Cache-Control "private, no-store" always;
    }
    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
        proxy_cache_bypass $http_upgrade;
    }
}
'''

    if Path('/etc/nginx/conf.d/ladyzenko-seo-logging.conf').exists():
        text=text.replace('    server_name ladyzenko.ru;','    server_name ladyzenko.ru;\n    access_log /var/log/nginx/ladyzenko-site.access.jsonl ladyzenko_seo;')
    return text


def install():
    if CONF.exists() and MARKER not in CONF.read_text(): raise RuntimeError('Existing domain configuration must be reviewed first')
    WEBROOT.mkdir(parents=True,exist_ok=True)
    if not CONF.exists(): CONF.write_text(http_config())
    link=Path('/etc/nginx/sites-enabled/ladyzenko.ru.conf')
    if not link.exists(): link.symlink_to(CONF)
    dest=Path('/opt/new-ladyzenko-domain');dest.mkdir(exist_ok=True)
    shutil.copy2(__file__,dest/'activate.py')
    Path('/etc/systemd/system/ladyzenko-domain.service').write_text('''[Unit]
Description=Activate Ladyzenko HTTPS after owner changes DNS
After=network-online.target nginx.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /opt/new-ladyzenko-domain/activate.py
TimeoutStartSec=600
UMask=0077
''')
    Path('/etc/systemd/system/ladyzenko-domain.timer').write_text('''[Unit]
Description=Wait for Ladyzenko DNS cutover
[Timer]
OnBootSec=2min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
''')
    run('nginx','-t');run('systemctl','reload','nginx');run('systemctl','daemon-reload');run('systemctl','enable','--now','ladyzenko-domain.timer')
    print('Prepared ladyzenko.ru. Existing DNS and current site were not changed.')

def activate():
    lock=open('/run/ladyzenko-domain.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if (STATE/'domain-activated.json').exists(): return
    for resolver in ['1.1.1.1','8.8.8.8']:
        if dns(resolver,'A')!={IP} or dns(resolver,'AAAA')!=set(): return
    attempt=STATE/'domain-last-attempt'
    if attempt.exists() and time.time()-attempt.stat().st_mtime<3600: return
    attempt.touch(mode=0o600)
    run('certbot','certonly','--webroot','--webroot-path',str(WEBROOT),'--cert-name',DOMAIN,'--domain',DOMAIN,'--non-interactive')
    previous=CONF.read_text()
    try:
        CONF.write_text(https_config());run('nginx','-t');run('systemctl','reload','nginx')
        run('curl','--fail','--silent','--show-error','--max-time','30','--resolve',DOMAIN+':443:127.0.0.1','https://'+DOMAIN+'/payment-info')
    except Exception:
        CONF.write_text(previous);run('nginx','-t');run('systemctl','reload','nginx');raise
    config=STATE/'config.json';shutil.copy2(config,STATE/'config.before-domain.json')
    data=json.loads(config.read_text());data['origin']='https://'+DOMAIN
    temp=STATE/'config.domain.tmp';temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.chmod(0o600);os.replace(temp,config)
    try:
        html=run('curl','--fail','--silent','--show-error','--max-time','30','--resolve',DOMAIN+':443:127.0.0.1','https://'+DOMAIN+'/')
        if '<link rel="canonical" href="https://ladyzenko.ru/"' not in html or re.search(r'<meta[^>]*name="robots"[^>]*content="[^"]*noindex',html,re.I):
            raise RuntimeError('Main-domain SEO verification failed')
        new=run('curl','--silent','--show-error','--max-time','30','--head','https://new.ladyzenko.ru/')
        if '308' not in new.splitlines()[0] or 'location: https://ladyzenko.ru/' not in new.lower():
            raise RuntimeError('Temporary-domain redirect verification failed')
    except Exception:
        shutil.copy2(STATE/'config.before-domain.json',config)
        CONF.write_text(previous);run('nginx','-t');run('systemctl','reload','nginx');raise
    (STATE/'domain-activated.json').write_text(json.dumps({'domain':DOMAIN,'activated':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})+'\n')
    run('systemctl','disable','--now','ladyzenko-domain.timer')
    print('Activated https://ladyzenko.ru with verified TLS. Existing payment webhook remains available on new.ladyzenko.ru.')

if __name__=='__main__':
    if '--install' in sys.argv: install()
    else: activate()
