#!/usr/bin/env python3
"""Loopback-only MP4 relay. Parallel verified ranges avoid slow single flows."""
import concurrent.futures
import json
import hmac
import os
import pathlib
import re
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import urllib3

CHUNK = 256 * 1024
WINDOW = 16
FILE = re.compile(r'/commerce-source/(school-lecture-(?:0[2-9]|1[0-3])\.mp4)')


def byte_range(value, size):
    if not value:
        return 0, size - 1, 200
    match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
    if not match or not any(match.groups()):
        raise ValueError('Invalid range')
    first, last = match.groups()
    if first:
        start, end = int(first), min(int(last), size - 1) if last else size - 1
    else:
        if int(last) == 0:
            raise ValueError('Empty suffix')
        start, end = max(0, size - int(last)), size - 1
    if start >= size or end < start:
        raise ValueError('Unsatisfied range')
    return start, end, 206


def parallel_chunks(source, name, start, end, metadata, executor):
    pending = deque()
    position = start
    try:
        while position <= end or pending:
            while position <= end and len(pending) < WINDOW:
                last = min(position + CHUNK - 1, end)
                pending.append(executor.submit(source.fetch, name, position, last, metadata))
                position = last + 1
            yield pending.popleft().result()
    finally:
        for future in pending:
            future.cancel()


class Source:
    def __init__(self, settings):
        self.secret = settings['secret']
        if not re.fullmatch(r'[a-f0-9]{64}', self.secret):
            raise ValueError('Invalid source credential')
        self.http = urllib3.PoolManager(
            num_pools=1, maxsize=32, block=True,
            source_address=(settings['bindAddress'], 0),
            cert_reqs='CERT_REQUIRED', ca_certs='/etc/ssl/certs/ca-certificates.crt',
            timeout=urllib3.Timeout(connect=5, read=20), retries=False)
        self.cache = {}
        self.lock = threading.Lock()

    def request(self, method, name, headers=None):
        # Origin and path cannot be supplied by a client.
        return self.http.request(method, 'https://video.ladyzenko.ru/commerce-source/' + name,
                                 headers={'X-Ladyzenko-Source': self.secret, **(headers or {})},
                                 redirect=False, pool_timeout=10)

    def metadata(self, name):
        with self.lock:
            cached = self.cache.get(name)
            if cached and cached['cachedAt'] > time.monotonic() - 300:
                return cached
            response = self.request('HEAD', name)
            size = int(response.headers.get('Content-Length', '0'))
            etag = response.headers.get('ETag', '')
            if response.status != 200 or size <= 0 or not re.fullmatch(r'"[a-zA-Z0-9-]+"', etag):
                raise RuntimeError('Source metadata unavailable')
            result = {'size': size, 'etag': etag, 'cachedAt': time.monotonic()}
            self.cache[name] = result
            return result

    def fetch(self, name, start, end, metadata):
        for attempt in range(3):
            try:
                response = self.request('GET', name, {'Range': f'bytes={start}-{end}', 'If-Match': metadata['etag']})
                if response.status != 206 or response.headers.get('Content-Range') != f'bytes {start}-{end}/{metadata["size"]}' or response.headers.get('ETag') != metadata['etag'] or len(response.data) != end - start + 1:
                    raise RuntimeError('Source range mismatch')
                return response.data
            except Exception:
                if attempt == 2:
                    raise RuntimeError('Source range unavailable') from None
                time.sleep(0.2)


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    source = None
    executor = None
    clients = threading.BoundedSemaphore(8)

    def log_message(self, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def do_HEAD(self):
        self.serve(head=True)

    def do_GET(self):
        self.serve()

    def error(self, status, size=None):
        self.send_response(status)
        self.send_header('Content-Length', '0')
        self.send_header('Cache-Control', 'private, no-store')
        if size is not None:
            self.send_header('Content-Range', f'bytes */{size}')
        self.end_headers()

    def serve(self, head=False):
        if not hmac.compare_digest(self.headers.get('X-Ladyzenko-Source', '').encode('utf-8'), self.source.secret.encode('ascii')):
            self.error(404)
            return
        url = urlsplit(self.path)
        match = FILE.fullmatch(url.path)
        if not match or url.query:
            self.error(404)
            return
        if not self.clients.acquire(blocking=False):
            self.error(503)
            return
        stream = None
        headers_sent = False
        try:
            name = match.group(1)
            metadata = self.source.metadata(name)
            requested = self.headers.get('Range', '')
            if self.headers.get('If-Range') not in (None, metadata['etag']):
                requested = ''
            try:
                start, end, status = byte_range(requested, metadata['size'])
            except ValueError:
                self.error(416, metadata['size'])
                return
            if not head:
                stream = parallel_chunks(self.source, name, start, end, metadata, self.executor)
                first = next(stream)  # Verify origin before sending successful headers.
            self.send_response(status)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('ETag', metadata['etag'])
            self.send_header('Cache-Control', 'private, no-store')
            if status == 206:
                self.send_header('Content-Range', f'bytes {start}-{end}/{metadata["size"]}')
            self.end_headers()
            headers_sent = True
            if not head:
                self.wfile.write(first)
                for data in stream:
                    self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except Exception as error:
            # Exception messages and upstream headers may contain credentials.
            print(json.dumps({'event': 'media_error', 'type': type(error).__name__}), flush=True)
            if not headers_sent:
                self.error(502)
            self.close_connection = True
        finally:
            if stream is not None:
                stream.close()
            self.clients.release()


if __name__ == '__main__':
    credential = pathlib.Path(os.environ['CREDENTIALS_DIRECTORY']) / 'source'
    settings = json.loads(credential.read_text())
    Handler.source = Source(settings)
    Handler.executor = concurrent.futures.ThreadPoolExecutor(max_workers=32)
    server = ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('MEDIA_RELAY_PORT', '38444'))), Handler)
    server.daemon_threads = True
    server.serve_forever()
