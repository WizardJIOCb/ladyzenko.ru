"""Build metadata from the preserved text; never invent publication dates."""
import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]

def compact(text):
    return re.sub(r'\s+', ' ', text).strip()

def prepare():
    output = {}
    for page in json.loads((ROOT/'mirror/manifest.json').read_text(encoding='utf-8')):
        b = BeautifulSoup((ROOT/'mirror/pages'/(page['slug']+'.html')).read_text(encoding='utf-8'), 'html.parser')
        heading = b.find('h1')
        headline = compact(heading.get_text(' ', strip=True) if heading else re.sub(r'^Copy of\s+', '', page['title']))
        article = b.select_one('[itemprop=articleBody]')
        body = compact(article.get_text(' ', strip=True)) if article else ''
        desc = b.select_one('meta[name=description]')
        description = compact(desc.get('content','')) if desc else ''
        if article:
            description = body[:200].rsplit(' ',1)[0].rstrip(' ,;:') + ('…' if len(body)>200 else '')
        if not description:
            description = f'{headline}. Материалы психолога Людмилы Ладыженко: статьи, лекции и личный опыт.'
        if page['slug']=='index':
            headline='Психолог Людмила Ивановна Ладыженко'
            description='Психолог Людмила Ладыженко. Частная практика с 1996 года, индивидуальные консультации, авторские статьи и лекции об отношениях, семье и воспитании.'
        image=b.select_one('meta[property="og:image"]')
        if image is None: image=b.select_one('[itemprop=image]')
        date=lambda key: (b.select_one('[itemprop='+key+']') or {}).get('content','')
        output[page['slug']]={
            'path':page['path'],'headline':headline,
            'title': headline if page['slug']=='new' or 'Ладыженко' in headline else headline+' | Людмила Ладыженко',
            'description':description,'article':bool(article),
            'image':image.get('content') or image.get('src','') if image else '/stuff/block-3.jpg',
            'published':date('datePublished'),'modified':date('dateModified'),
        }
    (ROOT/'mirror/seo.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Prepared metadata for',len(output),'pages')

if __name__=='__main__': prepare()
