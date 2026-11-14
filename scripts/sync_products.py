"""Extract real product identities, prices and descriptions; never pair by sort order."""
import json
from pathlib import Path
from bs4 import BeautifulSoup

root = Path(__file__).resolve().parents[1]
soup = BeautifulSoup((root / 'export/raw_html/index.html').read_text(encoding='utf-8'), 'lxml')
products = []
for card in soup.select('.t786__product-full.js-product'):
    title = card.select_one('.js-product-name')
    price = card.select_one('.js-product-price')
    image = card.select_one('[data-original]')
    description = card.select_one('.t786__descr')
    if not title or not price:
        raise ValueError('Product missing title or price')
    products.append(dict(id='lecture-' + card['data-product-lid'], kind='lecture',
        title=title.get_text(' ', strip=True), amount=int(price.get_text(strip=True).replace(' ', '')) * 100,
        image=image.get('data-original', '') if image else '',
        description=description.get_text('\n', strip=True) if description else '', accessDays=30))
if len(products) != 8:
    raise ValueError(f'Expected 8 lecture products, got {len(products)}; review source changes')
out = root / 'lib/lecture-products.json'
out.write_text(json.dumps(products, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Extracted {len(products)} lecture products with stable Tilda identifiers')
