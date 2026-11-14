#!/usr/bin/env python3
"""Install a private Nginx media link; read {secret} from stdin, never argv.

Run on the media host with 'source', and the website host with 'consumer'.
Nginx is checked before reload; its previous config is retained for rollback.
"""
import datetime
import json
import pathlib
import os
import pwd
import re
import shutil
import subprocess
import sys

role = sys.argv[1]
settings = json.load(sys.stdin)
secret = settings['secret']
if role not in ('source', 'consumer') or not re.fullmatch(r'[a-f0-9]{64}', secret):
    raise ValueError('Invalid role or secret')
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/var/backups/new-ladyzenko-remote-media') / (stamp + '-' + role)
backup.mkdir(parents=True, mode=0o700)
if role == 'source':
    nginx = pathlib.Path('/etc/nginx/conf.d/video.ladyzenko.ru.conf')
    private = pathlib.Path('/etc/nginx/new-ladyzenko-source.inc')
    body = '''    location ^~ /commerce-source/ {
        if ($http_x_ladyzenko_source != "SECRET") { return 404; }
        if ($uri !~ "^/commerce-source/[a-zA-Z0-9_-]+\\.mp4$") { return 404; }
        alias /var/lib/new-ladyzenko-recordings/;
        access_log off;
        add_header Cache-Control "private, no-store" always;
        add_header X-Content-Type-Options nosniff always;
        add_header X-Robots-Tag "noindex, nofollow" always;
        sendfile on;
    }
'''
    anchor = '    location = /catalog.json {'
    media = pathlib.Path('/var/lib/new-ladyzenko-recordings')
    media.mkdir(exist_ok=True, mode=0o750)
    nginx_user = re.search(r'^\s*user\s+([A-Za-z0-9_-]+)', pathlib.Path('/etc/nginx/nginx.conf').read_text(), re.M).group(1)
    os.chown(media, 0, pwd.getpwnam(nginx_user).pw_gid)
    media.chmod(0o750)
else:
    nginx = pathlib.Path('/etc/nginx/sites-available/new.ladyzenko.ru.conf')
    private = pathlib.Path('/etc/nginx/new-ladyzenko-consumer.inc')
    body = '''    location ^~ /commerce-remote/ {
        internal;
        if ($uri !~ "^/commerce-remote/[a-zA-Z0-9_-]+\\.mp4$") { return 404; }
        proxy_pass https://video.ladyzenko.ru/commerce-source/;
        proxy_set_header X-Ladyzenko-Source "SECRET";
        proxy_set_header Host video.ladyzenko.ru;
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
        proxy_ssl_server_name on;
        proxy_ssl_name video.ladyzenko.ru;
        proxy_ssl_verify on;
        proxy_ssl_verify_depth 5;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
        add_header Cache-Control "private, no-store" always;
        add_header X-Content-Type-Options nosniff always;
    }
'''
    anchor = '    location ^~ /commerce-private/ {'
    if settings.get('relayPort') is not None:
        port = settings['relayPort']
        if type(port) is not int or not 1024 <= port <= 65535:
            raise ValueError('Invalid loopback relay port')
        body = body.replace('https://video.ladyzenko.ru/commerce-source/',
                            f'http://127.0.0.1:{port}/commerce-source/')
shutil.copy2(nginx, backup / 'nginx.conf')
had_private = private.exists()
if had_private:
    shutil.copy2(private, backup / 'private.inc')
private.write_text(body.replace('SECRET', secret))
private.chmod(0o600)
include = '    include ' + str(private) + ';\n\n'
text = nginx.read_text()
if include not in text:
    if anchor not in text:
        raise ValueError('Nginx insertion point missing')
    nginx.write_text(text.replace(anchor, include + anchor, 1))
try:
    # Nginx diagnostic output can contain config values: suppress it here.
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True, capture_output=True)
except Exception:
    shutil.copy2(backup / 'nginx.conf', nginx)
    if had_private:
        shutil.copy2(backup / 'private.inc', private)
    else:
        private.unlink(missing_ok=True)
    raise RuntimeError('Nginx configuration failed; previous files restored') from None
print(json.dumps({'role': role, 'configured': True, 'backup': str(backup)}))
