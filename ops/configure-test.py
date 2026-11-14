"""Read a test key through stdin; no key is accepted on the command line or logged."""
import json
import os
from pathlib import Path
import re
import sys

key = sys.stdin.read().strip()
if not re.fullmatch(r'test_[a-zA-Z0-9_-]{20,150}', key):
    raise SystemExit('Expected a sandbox API key')
shop = sys.argv[1]
if not shop.isdigit():
    raise SystemExit('Expected numeric sandbox ShopID')
p = Path('/var/lib/new-ladyzenko-commerce/config.json')
c = json.loads(p.read_text())
if c.get('mode') == 'live' and c.get('enabled'):
    raise SystemExit('Refusing to replace an enabled live shop')
c.update(shopId=shop,shopKey=key,mode='test',enabled=True,legalApproved=False,fiscalizationConfirmed=False)
tmp = p.with_suffix('.tmp')
tmp.write_text(json.dumps(c,ensure_ascii=False,indent=2)+'\n')
tmp.chmod(0o600)
os.replace(tmp,p)
print('Sandbox configured. Live payments remain blocked.')
