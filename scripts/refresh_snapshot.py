"""Re-parse the saved public HTML snapshot without extra network requests."""
from pathlib import Path
import json
from export_tilda_site import extract_page, write_json, write_text, markdown_for_page

index = json.loads(Path('export/site-index.json').read_text(encoding='utf-8'))
for entry in index['pages']:
    html = Path('export/raw_html', entry['slug'] + '.html').read_text(encoding='utf-8')
    page = extract_page(entry['url'], html)
    write_json(Path('export/pages', page.slug + '.json'), page.__dict__)
    write_text(Path('export/pages', page.slug + '.md'), markdown_for_page(page, index['assets']))
print('Re-parsed', len(index['pages']), 'saved pages including Tilda rich text and Zero Block copy')
