#!/usr/bin/env python3
"""Run on the commerce host, receiving verify-recordings.py JSON via stdin.

Verify three byte ranges through the actual private Nginx proxy, ensure direct
URLs remain closed, then atomically enable only those verified recordings.
"""
import datetime
import hashlib
import json
import os
import pathlib
import re
import socket
import subprocess
import sys
import time
import urllib.request
import urllib.error

records = json.load(sys.stdin)
if not records:
    raise ValueError('No verified recordings')
for record in records:
    name = record.setdefault('filename', record['id'] + '.mp4')
    if not re.fullmatch(r'(school-lecture-(0[1-9]|1[0-3])|lecture-\d{13})', record['id']) or not re.fullmatch(re.escape(record['id']) + r'(-[a-f0-9]{16})?\.mp4', name) or record.get('decodedSamples') != 3:
        raise ValueError('Unexpected or unverified recording')
sock = socket.socket()
sock.bind(('127.0.0.1', 0))
port = sock.getsockname()[1]
sock.close()
qa = pathlib.Path('/etc/nginx/conf.d/new-ladyzenko-transport-qa.conf')
if qa.exists():
    raise RuntimeError('Another transport check is running')
qa.write_text('server { listen 127.0.0.1:' + str(port) + ''';
    server_name localhost;
    include /etc/nginx/new-ladyzenko-consumer.inc;
    location ^~ /probe/ { rewrite ^/probe/([a-zA-Z0-9_-]+\\.mp4)$ /commerce-remote/$1 last; }
}''')


def reload_nginx():
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True, capture_output=True)


try:
    reload_nginx()
    time.sleep(1)
    for record in records:
        for sample in record['rangeSamples']:
            start = sample['offset']
            end = start + 1023
            request = urllib.request.Request('http://127.0.0.1:' + str(port) + '/probe/' + record['filename'],
                                             headers={'Range': f'bytes={start}-{end}'})
            with urllib.request.urlopen(request, timeout=45) as response:
                if response.status != 206 or response.headers['Content-Range'] != f'bytes {start}-{end}/{record["bytes"]}' or hashlib.sha256(response.read()).hexdigest() != sample['sha256']:
                    raise RuntimeError('Range verification failed')
        for url in ('https://video.ladyzenko.ru/commerce-source/', 'https://new.ladyzenko.ru/commerce-remote/'):
            try:
                urllib.request.urlopen(url + record['filename'], timeout=20).close()
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    continue
            raise RuntimeError('Direct media URL is not closed')
    config = pathlib.Path('/var/lib/new-ladyzenko-commerce/config.json')
    content = config.read_bytes()
    current = json.loads(content)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = config.with_name('config.before-recordings-' + stamp + '.json')
    backup.write_bytes(content)
    backup.chmod(0o600)
    current.setdefault('lectureRemoteFiles', {}).update({r['id']: r['filename'] for r in records})
    temporary = config.with_name('config.recordings.tmp')
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n')
    temporary.chmod(0o600)
    # Do not overwrite a concurrent admin/legal update made during the checks.
    if config.read_bytes() != content:
        temporary.unlink()
        raise RuntimeError('Configuration changed; repeat activation')
    os.replace(temporary, config)
    print(json.dumps({'enabledRecordings': sorted(current['lectureRemoteFiles']), 'rangeChecks': len(records) * 3}))
finally:
    qa.unlink(missing_ok=True)
    reload_nginx()
