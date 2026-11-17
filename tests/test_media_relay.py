import concurrent.futures
import importlib.util
import pathlib
import os
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location('media_relay', os.environ.get('MEDIA_RELAY_SOURCE', str(pathlib.Path(__file__).parents[1] / 'ops/media-relay.py')))
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class Fixture:
    data = bytes(range(256)) * 4096
    secret = 'f' * 64

    def metadata(self, name):
        return {'size': len(self.data), 'etag': '"fixture"'}

    def fetch(self, name, start, end, metadata):
        # Deliberately finish later ranges first to exercise ordered delivery.
        time.sleep(0.01 if start == 0 else 0.001)
        return self.data[start:end + 1]


class MediaRelayTests(unittest.TestCase):
    def request(self, url=None, headers=None, method=None):
        return urllib.request.Request(url or self.url, headers={'X-Ladyzenko-Source': Fixture.secret, **(headers or {})}, method=method)

    @classmethod
    def setUpClass(cls):
        cls.executor = concurrent.futures.ThreadPoolExecutor(max_workers=4)
        class Handler(relay.Handler):
            source = Fixture()
            executor = cls.executor
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = 'http://127.0.0.1:' + str(cls.server.server_port) + '/commerce-source/school-lecture-02.mp4'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.executor.shutdown()

    def test_full_and_cross_chunk_range_preserve_exact_bytes(self):
        with urllib.request.urlopen(self.request()) as response:
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), Fixture.data)
            self.assertNotIn('X-Ladyzenko-Source', response.headers)
        request = self.request(headers={'Range': 'bytes=200000-800123'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.status, 206)
            self.assertEqual(response.headers['Content-Range'], 'bytes 200000-800123/1048576')
            self.assertEqual(response.read(), Fixture.data[200000:800124])
            self.assertIn('no-store', response.headers['Cache-Control'])

    def test_suffix_head_and_unsatisfied_or_multiple_ranges(self):
        request = self.request(headers={'Range': 'bytes=-17'})
        with urllib.request.urlopen(request) as response:
            self.assertEqual(response.read(), Fixture.data[-17:])
        with urllib.request.urlopen(self.request(method='HEAD')) as response:
            self.assertEqual(response.headers['Content-Length'], str(len(Fixture.data)))
            self.assertEqual(response.read(), b'')
        for value in ['bytes=1048576-', 'bytes=4-2', 'bytes=1-3,5-7', 'bytes=-0', 'invalid']:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(self.request(headers={'Range': value}))
            self.assertEqual(caught.exception.code, 416)

    def test_paths_and_source_url_injection_are_rejected(self):
        for suffix in ['../config.json', 'school-lecture-00.mp4', 'school-lecture-02.mp4?url=https://elsewhere.test']:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(self.request(self.url.rsplit('/', 1)[0] + '/' + suffix))
            self.assertEqual(caught.exception.code, 404)

    def test_loopback_access_also_requires_the_private_header(self):
        for header in ['', 'wrong', '\u00e9']:
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(urllib.request.Request(self.url, headers={'X-Ladyzenko-Source': header}))
            self.assertEqual(caught.exception.code, 404)

    def test_mismatched_source_content_is_never_returned(self):
        class Response:
            status = 206
            headers = {'Content-Range': 'bytes 0-3/4', 'ETag': '"fixture"'}
            data = b'ab'  # Truncated origin response.
        source = object.__new__(relay.Source)
        source.request = lambda *args, **kwargs: Response()
        with self.assertRaisesRegex(RuntimeError, 'unavailable'):
            source.fetch('school-lecture-02.mp4', 0, 3, {'size': 4, 'etag': '"fixture"'})


if __name__ == '__main__':
    unittest.main()
