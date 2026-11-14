"""Fill verified public facts, leaving unknown legal data blank. Never enables payments."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

state = Path(os.environ.get('COMMERCE_STATE', '/var/lib/new-ladyzenko-commerce'))
file = state / 'config.json'
config = json.loads(file.read_text())
backup = state / ('config.before-legal-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json')
backup.write_bytes(file.read_bytes())
backup.chmod(0o600)
for key, value in dict(contactPhone='+7 917 754 23 23', productionShopId='1529009', sellerStatus='', registrationNumber='', postalAddress='', sellerBasis='', sellerBasisConfirmed=False, adminNotes='Нужно сверить статус продавца по договору ЮKassa и основание продажи услуг/записей Людмилы. Адрес и ОГРНИП (если ИП) внести после проверки. Чеки и записи отложены владельцем.').items():
    config.setdefault(key, value)
# The new revision needs the remaining public facts before it can be approved.
if not config.get('postalAddress') or not config.get('sellerStatus') or not config.get('sellerBasisConfirmed'):
    config['legalApproved'] = False
temp = file.with_suffix('.legal.tmp')
with temp.open('x', encoding='utf-8') as stream:
    os.chmod(temp, 0o600)
    json.dump(config, stream, ensure_ascii=False, indent=2)
    stream.write('\n')
os.replace(temp, file)
print('Known public facts added; missing fields left for the administrator. Payment mode unchanged.')
