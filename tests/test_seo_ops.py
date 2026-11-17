import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

if sys.platform=='win32':sys.modules.setdefault('fcntl',types.SimpleNamespace())
spec=importlib.util.spec_from_file_location('seo_health',Path(__file__).resolve().parents[1]/'ops/seo-health.py')
seo=importlib.util.module_from_spec(spec);spec.loader.exec_module(seo)

class IndexNowBoundary(unittest.TestCase):
    def test_staging_never_makes_external_requests(self):
        with patch.object(seo,'fetch',side_effect=AssertionError('unexpected network')):
            self.assertEqual(seo.indexnow('https://new.ladyzenko.ru')['state'],'deferred')

    def test_noindex_or_dns_mismatch_keeps_the_queue(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'queue').mkdir();(root/'indexnow-key').write_text('a'*64)
            q=root/'queue/a.json';q.write_text(json.dumps({'path':'/articles'}))
            with patch.object(seo,'SEO',root),patch.object(seo.socket,'gethostbyname_ex',return_value=('',[],['82.146.42.213'])),patch.object(seo,'fetch',return_value=(200,{'X-Robots-Tag':'noindex'},'')) as fetch:
                self.assertEqual(seo.indexnow('https://ladyzenko.ru')['state'],'retry')
                self.assertEqual(fetch.call_count,1);self.assertTrue(q.exists())

    def test_only_public_paths_sent_and_concurrent_editor_change_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'queue').mkdir();(root/'indexnow-key').write_text('a'*64)
            q=root/'queue/a.json';q.write_text(json.dumps({'path':'/articles','updated':'old'}))
            (root/'queue/private.json').write_text(json.dumps({'path':'/orders/private'}))
            def fetch(url,agent=seo.UA,body=None):
                if url.endswith('/indexnow-key.txt'):return 200,{},'a'*64
                if url.endswith('/'):return 200,{},'<meta name="robots" content="index, follow">'
                data=json.loads(body);self.assertEqual(data['urlList'],['https://ladyzenko.ru/articles'])
                q.write_text(json.dumps({'path':'/articles','updated':'new'}));return 200,{},''
            with patch.object(seo,'SEO',root),patch.object(seo.socket,'gethostbyname_ex',return_value=('',[],['82.146.42.213'])),patch.object(seo,'fetch',side_effect=fetch):
                self.assertEqual(seo.indexnow('https://ladyzenko.ru')['state'],'received')
                self.assertEqual(json.loads(q.read_text())['updated'],'new')

if __name__=='__main__':unittest.main()
