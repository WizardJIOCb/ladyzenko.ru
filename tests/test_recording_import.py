import importlib.util
import pathlib
import socket
import unittest
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('recording_import', pathlib.Path(__file__).parents[1] / 'ops/recording-import-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class ImportNetworkTests(unittest.TestCase):
    def test_rejects_private_mixed_loopback_linklocal_and_multicast_addresses(self):
        for addresses in [('127.0.0.1',), ('169.254.169.254',), ('10.0.0.1',), ('::1',), ('fe80::1',), ('224.0.0.1',), ('8.8.8.8', '192.168.1.1')]:
            with patch.object(socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 0, '', (a, 443)) for a in addresses]):
                with self.assertRaises(worker.ImportFailure):
                    worker.public_target('https://files.example.com/video.mp4')

    def test_preserves_public_target_and_rejects_credentials_ports_and_insecure_scheme(self):
        with patch.object(socket, 'getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 0, '', ('8.8.8.8', 443))]):
            self.assertEqual(worker.public_target('https://files.example.com/a?token=private')[1], '8.8.8.8')
        for url in ['http://files.example.com/a', 'https://user:pass@files.example.com/a', 'https://files.example.com:8443/a']:
            with self.assertRaises(worker.ImportFailure):
                worker.public_target(url)

    def test_redirect_is_resolved_and_revalidated_before_connecting(self):
        class Response:
            status = 302
            def getheader(self, name, default): return 'https://127.0.0.1/secret'
        class Connection:
            def __init__(self, host, address): self.host = host
            def request(self, *args, **kwargs): pass
            def getresponse(self): return Response()
            def close(self): pass
        def resolve(host, *args, **kwargs):
            return [(socket.AF_INET, socket.SOCK_STREAM, 0, '', ('127.0.0.1' if host == '127.0.0.1' else '8.8.8.8', 443))]
        with patch.object(worker, 'PinnedHTTPS', Connection), patch.object(socket, 'getaddrinfo', side_effect=resolve):
            with self.assertRaises(worker.ImportFailure):
                worker.public_get('https://files.example.com/a')


if __name__ == '__main__': unittest.main()
