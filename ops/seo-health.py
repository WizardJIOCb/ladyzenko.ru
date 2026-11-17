"""Private reports and deferred IndexNow. No credentials or personal data in output."""
import collections
from datetime import datetime, timedelta, timezone
import fcntl
import gzip
import hashlib
import json
from pathlib import Path
import re
import socket
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from zoneinfo import ZoneInfo

ROOT=Path(__file__).resolve().parents[1]
STATE=Path('/var/lib/new-ladyzenko-commerce')
SEO=STATE/'seo'
UA='Ladyzenko-Health/1.0'
TZ=ZoneInfo('Asia/Yekaterinburg')

def write(file,data):
    file.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp=file.with_suffix(file.suffix+'.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.chmod(0o600);temp.replace(file)

def fetch(url,agent=UA,body=None):
    req=urllib.request.Request(url,data=body,headers={'User-Agent':agent,**({'Content-Type':'application/json'} if body else {})})
    with urllib.request.urlopen(req,timeout=25) as r:return r.status,dict(r.headers),r.read().decode('utf-8')

def public_paths():
    pages=json.loads((ROOT/'mirror/manifest.json').read_text(encoding='utf-8'))
    paths=[p['path'] for p in pages if not re.fullmatch(r'/(new|para1html|page\d+\.html)',p['path'])]
    for name in ['lecture-products.json','school-products.json']:
        paths.extend('/recordings/'+p['id'] for p in json.loads((ROOT/'lib'/name).read_text(encoding='utf-8')))
    paths+=['/recordings/lecture-1794913200000','/articles','/lectures','/services']
    return sorted(set(paths))

def seed():
    for p in public_paths():
        file=SEO/'queue'/(hashlib.sha256(p.encode()).hexdigest()+'.json')
        if not file.exists():write(file,{'path':p,'updated':datetime.now(timezone.utc).isoformat()})

def indexnow(origin):
    if origin!='https://ladyzenko.ru':return {'state':'deferred','reason':'temporary_domain'}
    status_file=SEO/'indexnow-status.json'
    previous=json.loads(status_file.read_text(encoding='utf-8')) if status_file.exists() else {}
    if time.time()<previous.get('retry_after',0):return previous
    files=list((SEO/'queue').glob('*.json')) if (SEO/'queue').exists() else []
    if not files:return {'state':'idle'}
    try:
        if set(socket.gethostbyname_ex('ladyzenko.ru')[2])!={'82.146.42.213'}:raise RuntimeError('Target DNS has not reached this server')
        key=(SEO/'indexnow-key').read_text(encoding='utf-8').strip()
        if not re.fullmatch('[a-f0-9]{64}',key):raise RuntimeError('Invalid private IndexNow configuration')
        code,headers,home=fetch(origin+'/')
        if code!=200 or 'noindex' in headers.get('X-Robots-Tag','').lower() or re.search(r'<meta[^>]*name="robots"[^>]*content="[^"]*noindex',home,re.I):raise RuntimeError('Target is not indexable')
        if fetch(origin+'/indexnow-key.txt')[2].strip()!=key:raise RuntimeError('Public ownership key is not ready')
        allowed=set(public_paths());snapshots={f:f.read_text(encoding='utf-8') for f in files[:10000]}
        batch=[origin+json.loads(value)['path'] for value in snapshots.values() if json.loads(value)['path'] in allowed]
        payload={'host':'ladyzenko.ru','key':key,'keyLocation':origin+'/indexnow-key.txt','urlList':batch}
        code,_,_=fetch('https://api.indexnow.org/indexnow',body=json.dumps(payload).encode()) if batch else (200,{},'')
        if code not in [200,202]:raise RuntimeError('IndexNow did not acknowledge submission')
        for f,value in snapshots.items():
            if f.exists() and f.read_text(encoding='utf-8')==value:f.unlink()
        result={'state':'received' if code==200 else 'key_validation_pending','submitted':len(batch),'http_status':code,'checked_at':datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        # Never include a request URL, payload or key in diagnostic messages.
        result={'state':'retry','error_type':type(e).__name__,'retry_after':time.time()+3600,'checked_at':datetime.now(timezone.utc).isoformat()}
    write(status_file,result);return result

def traffic():
    days={};salt=(SEO/'indexnow-key').read_text(encoding='utf-8').strip();cutoff=datetime.now(TZ).date()-timedelta(days=30);paths=set(public_paths())
    for f in Path('/var/log/nginx').glob('ladyzenko-site.access.jsonl*'):
        opener=gzip.open if f.suffix=='.gz' else open
        with opener(f,'rt',errors='replace') as stream:
            for line in stream:
                try:row=json.loads(line);when=datetime.fromisoformat(row['time']).astimezone(TZ);day=when.date()
                except (ValueError,KeyError):continue
                if day<cutoff or row.get('host') not in ['ladyzenko.ru','new.ladyzenko.ru']:continue
                ua=row.get('ua','');p=row.get('path','')
                if row.get('probe') or re.search(r'Codex|Ladyzenko-Health',ua,re.I):continue
                entry=days.setdefault(str(day),{'document_requests':0,'estimated_browser_visitors':set(),'ai_search_requests':0,'ai_user_fetches':0,'training_crawls':0,'ai_referral_document_requests':0,'errors_5xx':0})
                if row.get('status',0)>=500:entry['errors_5xx']+=1
                if re.search(r'OAI-SearchBot|PerplexityBot|Claude-SearchBot',ua,re.I):entry['ai_search_requests']+=1
                elif re.search(r'ChatGPT-User|Claude-User|Perplexity-User',ua,re.I):entry['ai_user_fetches']+=1
                elif re.search(r'GPTBot|ClaudeBot|CCBot|Bytespider',ua,re.I):entry['training_crawls']+=1
                document=row.get('method')=='GET' and row.get('status')==200 and p!='/private' and p in paths
                browser='Mozilla/' in ua and not re.search(r'bot|spider|crawl|headless|python|curl|monitor|uptime',ua,re.I)
                if document and browser:
                    entry['document_requests']+=1
                    entry['estimated_browser_visitors'].add(hashlib.sha256((salt+str(day)+row.get('ip','')+ua).encode()).hexdigest())
                    ref=row.get('referrer_host','').lower();source=row.get('source','').lower()
                    if any(ref==h or ref.endswith('.'+h) for h in ['chatgpt.com','perplexity.ai','claude.ai']) or source in ['chatgpt.com','perplexity.ai','perplexity','claude.ai','claude']:entry['ai_referral_document_requests']+=1
    for entry in days.values():entry['estimated_browser_visitors']=len(entry['estimated_browser_visitors'])
    return days

def conversions():
    result={'source':'local orders and saved subscription forms','external_panels':'not_connected'}
    if (STATE/'orders.sqlite').exists():
        con=sqlite3.connect('file:'+str(STATE/'orders.sqlite')+'?mode=ro',uri=True)
        result['live_orders']=con.execute("SELECT count(*) FROM orders WHERE mode='live'").fetchone()[0]
        result['live_confirmed_payments']=con.execute("SELECT count(*) FROM orders WHERE mode='live' AND status='succeeded'").fetchone()[0]
        con.close()
    result['saved_subscriptions']=len(list((STATE/'content/inbox').glob('*.json')))
    return result

def health(origin):
    staging=origin!='https://ladyzenko.ru';issues=[];checks=[]
    article=next(p for p in public_paths() if p.startswith('/tpost/'))
    for p in ['/',article,'/recordings/school-lecture-02','/robots.txt','/sitemap.xml']:
        try:
            code,h,body=fetch(origin+p);checks.append({'path':p,'status':code})
            if p not in ['/robots.txt','/sitemap.xml']:
                closed='noindex' in h.get('X-Robots-Tag','').lower() or bool(re.search(r'<meta[^>]*name="robots"[^>]*content="[^"]*noindex',body,re.I))
                if staging!=closed:issues.append('Unexpected indexability: '+p)
                if '<link rel="canonical"' not in body and 'rel="canonical"' not in body:issues.append('Canonical missing: '+p)
                if 'application/ld+json' not in body:issues.append('Structured data missing: '+p)
        except Exception as e:issues.append('Availability '+p+': '+type(e).__name__)
    return checks,issues

def main():
    SEO.mkdir(exist_ok=True,mode=0o700)
    lock=open(SEO/'health.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    origin=json.loads((STATE/'config.json').read_text(encoding='utf-8')).get('origin','https://new.ladyzenko.ru')
    if '--seed' in sys.argv:seed();return
    if '--indexnow' in sys.argv:indexnow(origin);return
    checks,issues=health(origin)
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'origin':origin,'checks':checks,'issues':issues,'indexnow':indexnow(origin),'traffic':traffic(),'conversions':conversions(),'limitations':['Browser visitor counts are estimates; User-Agent labels are not IP-verified bot identities.','No historical trend is inferred before comparable full periods exist.','Search Console, Webmaster and Metrica owner reports are not connected.']}
    write(SEO/'latest.json',report)
    today=datetime.now(TZ).strftime('%Y-%m-%d');write(SEO/'reports'/(today+'.json'),report)
    if issues:print(json.dumps({'issues':issues},ensure_ascii=False));raise SystemExit(1)
    if '--summary' in sys.argv:print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
