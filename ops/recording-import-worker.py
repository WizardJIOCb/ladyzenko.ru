#!/usr/bin/env python3
"""Pull private import jobs; pin public DNS for every HTTPS redirect, verify MP4,
then ask the commerce host to verify its protected delivery before activation.
URLs and credentials never appear in logs or subprocess arguments.
"""
import http.client
import ipaddress
import json
import os
import pathlib
import re
import shutil
import socket
import ssl
import subprocess
import time
from urllib.parse import urlsplit, urljoin, urlencode


class ImportFailure(Exception):
    pass


def public_target(url):
    u = urlsplit(url)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.port not in (None, 443):
        raise ImportFailure('download')
    addresses = socket.getaddrinfo(u.hostname, 443, type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global or ipaddress.ip_address(a[4][0]).is_multicast for a in addresses):
        raise ImportFailure('download')
    return u, addresses[0][4][0]


class PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=40, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self._context.wrap_socket(sock, server_hostname=self.host)
        except Exception:
            sock.close()
            raise


def public_get(url):
    for _ in range(6):
        u, address = public_target(url)
        conn = PinnedHTTPS(u.hostname, address)
        try:
            conn.request('GET', (u.path or '/') + ('?' + u.query if u.query else ''),
                         headers={'User-Agent': 'LadyzenkoRecordingImport/1.0', 'Accept-Encoding': 'identity'})
            response = conn.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                url = urljoin(url, response.getheader('Location', ''))
                conn.close()
                continue
            if response.status != 200:
                raise ImportFailure('download')
            return conn, response
        except Exception:
            conn.close()
            raise
    raise ImportFailure('download')


def resolve_download(url):
    u = urlsplit(url)
    if u.hostname in ('drive.google.com', 'www.drive.google.com'):
        from urllib.parse import parse_qs
        match = re.fullmatch(r'/file/d/([A-Za-z0-9_-]{10,100})(?:/view)?/?', u.path)
        ident = match[1] if match else parse_qs(u.query).get('id', [''])[0] if u.path in ('/uc', '/open') else ''
        if not re.fullmatch(r'[A-Za-z0-9_-]{10,100}', ident):
            raise ImportFailure('download')
        return 'https://drive.usercontent.google.com/download?' + urlencode({'id': ident, 'export': 'download', 'confirm': 't'})
    if u.hostname in ('disk.yandex.ru', 'yadi.sk', 'disk.360.yandex.ru') and u.path.startswith(('/d/', '/i/')):
        conn, response = public_get('https://cloud-api.yandex.net/v1/disk/public/resources/download?' + urlencode({'public_key': url}))
        try:
            data = response.read(65537)
            if len(data) > 65536:
                raise ImportFailure('download')
            return json.loads(data)['href']
        finally:
            conn.close()
    return url


def download(url, destination, progress):
    budget = min(4 * 1024**3, (shutil.disk_usage(destination.parent).free - 2 * 1024**3) // 2)
    if budget < 10 * 1024**2:
        raise ImportFailure('space')
    conn, response = public_get(resolve_download(url))
    size = 0
    deadline = time.monotonic() + 14400
    reported = time.monotonic()
    try:
        length = int(response.getheader('Content-Length', '0'))
        if length > budget:
            raise ImportFailure('space')
        if 'text/' in response.getheader('Content-Type', ''):
            raise ImportFailure('format')
        with destination.open('xb') as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > budget or time.monotonic() > deadline:
                    raise ImportFailure('space' if size > budget else 'download')
                out.write(chunk)
                if time.monotonic() - reported > 60:
                    progress()
                    reported = time.monotonic()
        if size < 1024 or (length and size != length):
            raise ImportFailure('download')
    finally:
        conn.close()


def probe(file):
    result = subprocess.run(['ffprobe', '-v', 'error', '-protocol_whitelist', 'file', '-show_entries',
                             'format=duration,format_name:stream=codec_type,codec_name', '-of', 'json', str(file)],
                            capture_output=True, check=True, text=True, timeout=60)
    info = json.loads(result.stdout)
    streams = info.get('streams', [])
    duration = float(info['format']['duration'])
    if 'mp4' not in info['format']['format_name'] or not 30 <= duration <= 43200 or not any(s.get('codec_name') == 'h264' for s in streams) or not any(s.get('codec_name') == 'aac' for s in streams):
        raise ImportFailure('format')
    return duration


def verify(file, duration):
    for position in (0, duration / 2, max(0, duration - 4)):
        result = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file',
                                 '-ss', str(position), '-i', str(file), '-t', '3', '-map', '0:v:0', '-map', '0:a:0',
                                 '-f', 'null', '-'], capture_output=True, timeout=120)
        if result.returncode or result.stderr.strip():
            raise ImportFailure('format')


def main():
    os.umask(0o077)
    credentials = pathlib.Path(os.environ['CREDENTIALS_DIRECTORY']) / 'source'
    secret = json.loads(credentials.read_text())['secret']
    if not re.fullmatch(r'[a-f0-9]{64}', secret):
        raise RuntimeError('Invalid source credential')

    def api(data):
        conn = http.client.HTTPSConnection('new.ladyzenko.ru', timeout=60, context=ssl.create_default_context())
        try:
            conn.request('POST', '/api/recording-import', json.dumps(data),
                         {'Content-Type': 'application/json', 'X-Ladyzenko-Source': secret})
            response = conn.getresponse()
            body = response.read(32768)
            if response.status != 200:
                raise ImportFailure('network')
            return json.loads(body)
        finally:
            conn.close()

    job = api({'action': 'claim'}).get('job')
    if not job:
        return
    ident, version = job['product'], job['version']
    if not re.fullmatch(r'(lecture-\d{13}|school-lecture-(0[1-9]|1[0-3]))', ident) or not re.fullmatch(r'[a-f0-9]{16}', version):
        raise RuntimeError('Invalid job')
    base = pathlib.Path('/var/lib/new-ladyzenko-recordings')
    output = base / (ident + '-' + version + '.mp4')
    incoming = output.with_suffix('.download')
    remux = output.with_suffix('.incoming.mp4')
    common = {'product': ident, 'version': version}
    try:
        if not output.exists():
            incoming.unlink(missing_ok=True)
            remux.unlink(missing_ok=True)
            download(job['url'], incoming, lambda: api({**common, 'action': 'progress'}))
            probe(incoming)
            result = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-nostdin', '-protocol_whitelist', 'file',
                                     '-i', str(incoming), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
                                     '-movflags', '+faststart', str(remux)], capture_output=True, timeout=1800)
            if result.returncode or result.stderr.strip():
                raise ImportFailure('format')
            duration = probe(remux)
            verify(remux, duration)
            gid = base.stat().st_gid
            os.chown(remux, 0, gid)
            remux.chmod(0o640)
            remux.replace(output)
        duration = probe(output)
        verify(output, duration)
        api({**common, 'action': 'complete', 'bytes': output.stat().st_size, 'duration': duration, 'decodedSamples': 3})
        print(json.dumps({'product': ident, 'status': 'ready'}))
    except Exception as error:
        code = str(error) if isinstance(error, ImportFailure) else 'format'
        try:
            api({**common, 'action': 'error', 'code': code})
        except Exception:
            pass
        print(json.dumps({'product': ident, 'status': 'error', 'code': code}))
    finally:
        incoming.unlink(missing_ok=True)
        remux.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
