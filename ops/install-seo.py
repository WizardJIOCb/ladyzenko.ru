"""Install site-scoped logs and local SEO health jobs; never change DNS or credentials."""
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess

STATE=Path('/var/lib/new-ladyzenko-commerce/seo')
RELEASE=Path('/var/www/new.ladyzenko.ru-current')
LOG=Path('/etc/nginx/conf.d/ladyzenko-seo-logging.conf')
LINE='    access_log /var/log/nginx/ladyzenko-site.access.jsonl ladyzenko_seo;'

def run(*args):return subprocess.run(args,check=True,capture_output=True,text=True).stdout

def install():
    STATE.mkdir(mode=0o700,exist_ok=True)
    key=STATE/'indexnow-key'
    if not key.exists():key.write_text(secrets.token_hex(32));key.chmod(0o600)
    previous={}
    LOGTEXT=r'''
map $uri $ladyzenko_safe_path {
    default $uri;
    ~^/(orders|admin|api/commerce|api/admin|commerce-private|commerce-remote)(/|$) /private;
}
map $http_referer $ladyzenko_referrer_host {
    default "";
    ~^https?://(?<ladyzenko_refhost>[^/?\#]+) $ladyzenko_refhost;
}
map $arg_utm_source $ladyzenko_source {
    default "";
    ~*^(chatgpt\.com|perplexity\.ai|perplexity|claude\.ai|claude|yandex|google|telegram|vk)$ $arg_utm_source;
}
map $arg_geo_audit $ladyzenko_probe { default 1; "" 0; }
log_format ladyzenko_seo escape=json '{"time":"$time_iso8601","host":"$host","method":"$request_method","path":"$ladyzenko_safe_path","status":$status,"bytes":$body_bytes_sent,"duration":$request_time,"ua":"$http_user_agent","ip":"$remote_addr","referrer_host":"$ladyzenko_referrer_host","source":"$ladyzenko_source","probe":$ladyzenko_probe}';
'''
    targets=[LOG,Path('/etc/nginx/sites-available/new.ladyzenko.ru.conf'),Path('/etc/nginx/sites-available/ladyzenko.ru.conf')]
    for f in targets:previous[f]=f.read_text() if f.exists() else None
    try:
        LOG.write_text(LOGTEXT)
        for f in targets[1:]:
            if not f.exists():continue
            text=f.read_text()
            if 'ladyzenko-site.access.jsonl' not in text:
                import re
                text=re.sub(r'(\s*server_name (?:new\.)?ladyzenko\.ru;)',lambda m:m[0]+'\n'+LINE,text)
                f.write_text(text)
        run('nginx','-t');run('systemctl','reload','nginx')
    except Exception:
        for f,value in previous.items():
            if value is None:f.unlink(missing_ok=True)
            else:f.write_text(value)
        run('nginx','-t');run('systemctl','reload','nginx');raise
    Path('/etc/logrotate.d/ladyzenko-site').write_text('''/var/log/nginx/ladyzenko-site.access.jsonl {
    daily
    rotate 30
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /bin/systemctl kill --kill-who=main --signal=USR1 nginx.service >/dev/null 2>&1 || true
    endscript
}
''')
    for name in ['seo-health.service','seo-health.timer','seo-indexnow.service','seo-indexnow.timer']:
        shutil.copy2(RELEASE/'ops'/name,Path('/etc/systemd/system')/('ladyzenko-'+name))
    # Create a cutover batch from the prepared public URL inventory, not private routes.
    run('python3',str(RELEASE/'ops/seo-health.py'),'--seed')
    run('systemctl','daemon-reload');run('systemctl','enable','--now','ladyzenko-seo-health.timer','ladyzenko-seo-indexnow.timer')
    print('SEO logging, private key, deferred IndexNow and daily health timer installed.')

if __name__=='__main__':install()
