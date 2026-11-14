"""Preserve Tilda's published HTML, every discovered page and its local assets.

Blocked pages retain the prior successful snapshot and are reported explicitly.
Feeds are backed up separately, including getpost bodies, not just card teasers.
"""
from __future__ import annotations
import concurrent.futures as cf
import hashlib
import json
import re
import shutil
import time
import sys
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup, Comment, NavigableString

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://ladyzenko.ru'
OUT = ROOT / 'mirror'
ASSETS = ROOT / 'public/mirror-assets'
RAW = ROOT / 'export/raw_html'
REPORT: dict = {'pages': [], 'assetErrors': [], 'externalMedia': [], 'feeds': []}
asset_map: dict[str, str] = json.loads((OUT/'asset-map.json').read_text(encoding='utf-8')) if (OUT/'asset-map.json').exists() else {}
existing = json.loads((ROOT/'export/site-index.json').read_text(encoding='utf-8'))

def get(url):
    r = requests.get(url, timeout=35, headers={'User-Agent': 'Mozilla/5.0'})
    r.raise_for_status(); r.encoding = 'utf-8'
    return r

def slug(url):
    return re.sub(r'[^a-zA-Z0-9._-]+', '-', urlparse(url).path.strip('/')).strip('-') or 'index'

def write_json(file, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def local_asset(url):
    url = url.replace('&amp;', '&')
    if url in asset_map: return asset_map[url]
    parsed = urlparse(url)
    if not parsed.hostname or not (parsed.hostname.endswith('tildacdn.com') or parsed.hostname.endswith('tilda.ws')):
        return url
    if '/-/empty/' in url: return url
    ext = Path(parsed.path).suffix.lower()
    if not re.fullmatch(r'\.[a-z0-9]{1,6}', ext): ext = '.bin'
    target = ASSETS / (hashlib.sha256(url.encode()).hexdigest()[:24] + ext)
    public = '/mirror-assets/' + target.name
    try:
        if not target.exists():
            old = existing.get('assets', {}).get(url, '')
            if old and not old.startswith('ERROR') and (ROOT/old).is_file(): shutil.copyfile(ROOT/old, target)
            else: target.write_bytes(get(url).content)
        asset_map[url] = public
        if ext == '.css':
            css = target.read_text(encoding='utf-8')
            def replace(m):
                value = m.group(1).strip(' \"\'')
                if value.startswith(('data:','/mirror-assets/')): return m.group(0)
                return 'url("' + local_asset(urljoin(url, value)) + '")'
            target.write_text(re.sub(r'url\(([^)]+)\)', replace, css), encoding='utf-8')
        return public
    except Exception as e:
        REPORT['assetErrors'].append({'url': url, 'error': str(e)})
        return url

def rewrite_assets(html):
    # Includes inline CSS, JSON image galleries, lazy attributes and JS resources.
    urls = set(re.findall(r'https?://(?:[A-Za-z0-9.-]+\.)?(?:tildacdn\.com|tilda\.ws)/[^\s<>"\'\\)]+', html))
    for url in sorted(urls, key=len, reverse=True):
        if Path(urlparse(url).path).suffix.lower() in {'.js','.css','.jpg','.jpeg','.png','.gif','.webp','.svg','.ico','.woff','.woff2','.ttf','.mp4','.webm','.mp3','.pdf'}:
            html = html.replace(url, local_asset(url))
    return html

def fetch_page(url):
    name = slug(url); file = RAW/(name+'.html')
    if '--offline' in sys.argv and file.exists():
        previous=next((p['status'] for p in json.loads((OUT/'report.json').read_text(encoding='utf-8'))['pages'] if p.get('slug')==name),'saved-snapshot') if (OUT/'report.json').exists() else 'saved-snapshot'
        return url,file.read_text(encoding='utf-8'),previous
    try:
        if '--offline' in sys.argv: raise requests.RequestException('Offline rebuild of saved content')
        r = get(url)
        if '<html' not in r.text.lower(): raise ValueError('Not HTML')
        file.write_text(r.text, encoding='utf-8')
        return url, r.text, 'fresh'
    except Exception as e:
        if file.exists(): return url, file.read_text(encoding='utf-8'), 'saved-snapshot: '+str(e)
        return url, '', 'unavailable: '+str(e)

def main():
    for d in [OUT/'pages', OUT/'feeds', ASSETS]: d.mkdir(parents=True, exist_ok=True)
    urls = {e['url'] for e in existing['pages']}
    try:
        if '--offline' in sys.argv: raise requests.RequestException('Offline rebuild of saved content')
        sitemap = BeautifulSoup(get(SOURCE+'/sitemap.xml').text, 'xml')
        urls.update(e.get_text() for e in sitemap.select('loc'))
    except requests.RequestException as e:
        REPORT['sitemapStatus'] = str(e)
    # Feed lists have no post bodies; fetch all bodies independently.
    feeduids = set()
    for file in RAW.glob('*.html'):
        feeduids.update(re.findall(r"feeduid\s*:\s*['\"](\d+)", file.read_text(encoding='utf-8')))
    for uid in sorted(feeduids):
        feed = json.loads((OUT/'feeds'/('feed-'+uid+'.json')).read_text(encoding='utf-8')) if '--offline' in sys.argv else get('https://feeds.tildaapi.com/api/getfeed/?feeduid='+uid+'&size=1000&slice=1&getparts=true').json()
        if len(feed.get('posts',[])) != int(feed.get('total',0)): raise RuntimeError('Feed pagination must be handled: '+uid)
        posts = feed['posts']
        urls.update(urljoin(SOURCE,p['url']) for p in posts if p.get('url'))
        def get_post(p):
            target = OUT/'feeds'/('post-'+p['uid']+'.json')
            if '--offline' in sys.argv and target.exists(): return
            write_json(target, get('https://feeds.tildaapi.com/api/getpost/?postuid='+p['uid']).json())
        with cf.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(get_post, posts))
        write_json(OUT/'feeds'/('feed-'+uid+'.json'), feed)
        REPORT['feeds'].append({'uid': uid, 'posts': len(posts), 'fullBodies': len(posts)})
        print('FEED',uid,len(posts),flush=True)
    pages = []
    with cf.ThreadPoolExecutor(max_workers=5) as pool:
        for url, html, status in pool.map(fetch_page, sorted(urls)):
            if not html:
                REPORT['pages'].append({'url':url,'status':status}); continue
            pages.append((url,html,status))
    # Discover content pages omitted from sitemaps; exclude query/form endpoints.
    known = set(urls)
    for _ in range(3):
        found = set()
        for url, html, _status in pages:
            for a in BeautifulSoup(html,'html.parser').select('a[href]'):
                u = urlparse(urljoin(url,a['href']))
                if u.hostname in ['ladyzenko.ru','www.ladyzenko.ru'] and not u.query and not u.path.startswith(('/members','/cart','/api')) and (not Path(u.path).suffix or u.path.endswith('.html')):
                    found.add(SOURCE+(u.path.rstrip('/') or '/'))
        found -= known
        if not found: break
        known.update(found)
        with cf.ThreadPoolExecutor(max_workers=4) as pool:
            for url,html,status in pool.map(fetch_page,sorted(found)):
                if html: pages.append((url,html,status))
                else: REPORT['pages'].append({'url':url,'status':status})
    manifest = []
    for i,(url,html,status) in enumerate(pages):
        name=slug(url); s=BeautifulSoup(html,'html.parser')
        for node in s.select('[data-videolazy-type],iframe[src],video[src],video source[src]'):
            REPORT['externalMedia'].append({'page':url,'type':node.get('data-videolazy-type') or node.name,'source':node.get('data-videolazy-id') or node.get('src','')})
        for img in s.select('img[data-original][src]'):
            if '/-/empty/' in img['src']: img['src']=img['data-original']
        for a in s.select('a[href="#order"]'):
            product=a.find_parent(attrs={'data-product-lid':True})
            a['href']='/checkout/lecture-'+product['data-product-lid'] if product else '/lectures'
        for a in s.select('a[href]'):
            u=urlparse(a['href'])
            if u.hostname=='ladyzenko.pro':
                a['href']=(u.path or '/')+('#'+u.fragment if u.fragment else '')
                if u.path in ['/pro_lubov_kupit','/umor_kupit1','/detskii_rai_kupit']:
                    a['href']='/lectures'
        # Use our form endpoint; Tilda service keys do not migrate.
        for form in s.select('form'):
            form['data-local-form']='true'; form['action']='/api/site/contact'
            form.attrs.pop('data-formactiontype',None)
            for e in form.select('[name="formservices[]"]'): e.decompose()
        blocks=[]
        for node in list((s.body or s).descendants):
            if not isinstance(node,NavigableString) or isinstance(node,Comment) or not str(node).strip(): continue
            if any(p.name in ['script','style','noscript','svg','title','textarea','option'] for p in node.parents): continue
            key='t'+str(len(blocks)); text=str(node)
            blocks.append({'id':key,'type':'text','value':text,'label':node.parent.name})
            node.insert_before(Comment('cms:'+key)); node.insert_after(Comment('/cms:'+key))
        # Retain image source attributes exactly, including lazy background images.
        for node in s.select('img[src], [data-original]'):
            value=node.get('data-original') or node.get('src')
            if not value or value.startswith('data:'): continue
            key='i'+str(len(blocks)); blocks.append({'id':key,'type':'image','value':value,'label':node.get('alt') or 'Изображение'})
        for node in s.select('a[href]'):
            value=node['href']
            if value.startswith(('javascript:', '#')): continue
            key='l'+str(len(blocks)); node['data-cms-link']=key
            blocks.append({'id':key,'type':'link','value':value,'label':node.get_text(' ',strip=True)[:100] or 'Ссылка'})
        title=s.title.get_text() if s.title else name
        html=rewrite_assets(str(s))
        html=html.replace('https://ladyzenko.ru', '').replace('http://ladyzenko.ru','').replace('https://www.ladyzenko.ru','')
        # Browser feed adapter and form handling run before the original scripts.
        html=html.replace('<head>','<head><script src="/mirror-runtime.js"></script>',1)
        html=html.replace('</body>','<footer class="mirror-footer"><a href="/payment-info">Продавец и оплата</a> · <a href="/offer">Условия покупки</a> · <a href="/privacy">Обработка данных</a> · <a href="/consent">Согласие</a> · <a href="/admin">Управление</a></footer><style>.mirror-footer{padding:24px;text-align:center;font:14px/1.6 Arial,sans-serif;background:#fff;color:#444}.mirror-footer a{color:inherit;margin:0 6px}</style></body>')
        # Values in the editor must be the same as the localized document.
        for block in blocks:
            if block['type']!='text':
                value=block['value']; block['value']=asset_map.get(value,value).replace(SOURCE,'')
        path=urlparse(url).path.rstrip('/') or '/'
        entry={'slug':name,'path':path,'title':title,'sourceStatus':status,'blocks':blocks}
        write_json(OUT/'pages'/(name+'.json'),entry)
        (OUT/'pages'/(name+'.html')).write_text(html,encoding='utf-8')
        manifest.append({k:v for k,v in entry.items() if k!='blocks'})
        REPORT['pages'].append({'url':url,'status':status,'slug':name,'textBlocks':sum(b['type']=='text' for b in blocks)})
        print('PAGE',i+1,len(pages),name,status[:20],flush=True)
    # Localize feed images, full post markup, header/footer resources too.
    for file in (OUT/'feeds').glob('*.json'):
        data=json.loads(file.read_text(encoding='utf-8'))
        text=rewrite_assets(json.dumps(data,ensure_ascii=False)).replace(SOURCE,'')
        file.write_text(text,encoding='utf-8')
    write_json(OUT/'manifest.json',manifest)
    REPORT.update(generatedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),pageCount=len(manifest),assetCount=len(asset_map))
    write_json(OUT/'report.json',REPORT)
    write_json(OUT/'asset-map.json',asset_map)
    print('COMPLETE',len(manifest),'pages',len(asset_map),'assets','errors',len(REPORT['assetErrors']),flush=True)
    return 0

if __name__=='__main__': raise SystemExit(main())
