import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { renderMirror,mirrorPages,contentPage,saveContent } from '../lib/mirror.ts';
import { noindex,graph,productSeo,jsonLd } from '../lib/seo.ts';
import { lectureProducts } from '../lib/products.ts';
import { proxy } from '../proxy.ts';
import sitemap from '../app/sitemap.ts';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lady-seo-'));process.env.COMMERCE_STATE=dir;
const config=(origin:string)=>fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({origin}));
after(()=>fs.rmSync(dir,{recursive:true,force:true}));
config('https://new.ladyzenko.ru');

test('all preserved pages have one coherent metadata set, safe JSON-LD and a semantic H1',()=>{
  for(const page of mirrorPages()){
    const editor=contentPage(page.slug);assert.equal(saveContent({...editor,operation:'publish'}).published,null,'No-op changed date: '+page.slug);
    const html=renderMirror(page.slug,'https://new.ladyzenko.ru');
    assert.equal((html.match(/name="description"/g)||[]).length,1,page.slug);
    assert.equal((html.match(/name="robots"/g)||[]).length,1,page.slug);
    assert.match(html,/<meta name="robots" content="noindex, follow">/);
    assert.match(html,/<h1\b/);
    assert.match(html,/<meta name="description" content="[^"]+">/);
    const data=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    const person=data['@graph'].find((x:any)=>x['@type']==='Person');
    assert.equal(person.name,'Людмила Ивановна Ладыженко');assert.ok(person.sameAs.length>0);
    if(page.path.startsWith('/tpost/')){
      const article=data['@graph'].find((x:any)=>x['@type']==='BlogPosting');
      assert.equal(article.author['@id'],person['@id']);assert.ok(article.datePublished);assert.match(html,/class="seo-byline t-descr"/);
    }
    assert.ok(!html.includes('101283816'));
    assert.ok(!/ym\(\s*106094504/.test(html));
    assert.ok(html.includes('/site-analytics.js'));
  }
});

test('main domain indexes public content, redirects the temporary public site and preserves personal links',()=>{
  config('https://ladyzenko.ru');
  const html=renderMirror('index','https://ladyzenko.ru');assert.match(html,/content="index, follow"/);assert.ok(!html.includes('noindex'));
  assert.equal(noindex('https://ladyzenko.ru','/','ladyzenko.ru'),false);
  assert.equal(noindex('https://ladyzenko.ru','/','new.ladyzenko.ru'),true);
  const redirect=proxy(new NextRequest('https://new.ladyzenko.ru/articles?utm_source=chatgpt.com'));
  assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://ladyzenko.ru/articles?utm_source=chatgpt.com');
  for(const url of ['/orders/'+'a'.repeat(32),'/api/commerce/webhook','/admin','/checkout/school-lecture-02']){
    const result=proxy(new NextRequest('https://new.ladyzenko.ru'+url));assert.equal(result.headers.get('location'),null);assert.match(result.headers.get('X-Robots-Tag')!,/noindex/);
  }
  config('https://new.ladyzenko.ru');assert.equal(sitemap().length,0);
  config('https://ladyzenko.ru');const map=sitemap();assert.ok(map.length>130);assert.ok(map.every(x=>x.url.startsWith('https://ladyzenko.ru/')));assert.ok(!map.some(x=>x.url.endsWith('/new')||x.url.includes('/orders/')));
  config('https://new.ladyzenko.ru');
});

test('no-op publication preserves dates; actual text changes update both visible and machine dates and queue indexing',()=>{
  const slug='tpost-067pkfbdc1-ustoichivost-k-neopredelnnosti';
  const initial=contentPage(slug);const noOp=saveContent({...initial,operation:'publish'});
  assert.equal(noOp.published,null);
  const block=initial.blocks.find(x=>x.type==='text'&&x.value.includes('Устойчивость'))!;
  const next=saveContent({...noOp,operation:'publish',values:{[block.id]:block.value+' Уточнение автора.'}});
  assert.ok(next.published);
  const html=renderMirror(slug,'https://new.ladyzenko.ru');assert.ok(html.includes('Обновлено <time'));assert.ok(html.includes('"dateModified":"'+next.published+'"'));
  assert.equal(fs.readdirSync(path.join(dir,'seo','queue')).length,1);
  const unchanged=saveContent({...next,operation:'publish'});assert.equal(unchanged.published,next.published);
});

test('product metadata reflects the selected lecture and structured prices only advertise buyable products',()=>{
  const p=lectureProducts.find(x=>x.id==='school-lecture-02')!;assert.ok(productSeo(p).title.includes(p.title));
  const disabled=graph(productSeo(p),'https://ladyzenko.ru',p,false)['@graph'].find(x=>x['@type']==='Product')!;assert.equal(disabled.offers,undefined);
  const enabled=graph(productSeo(p),'https://ladyzenko.ru',p,true)['@graph'].find(x=>x['@type']==='Product')!;assert.equal((enabled.offers as any).price,'1000.00');
  assert.ok(!jsonLd({text:'</script><script>alert(1)</script>'}).includes('<'));
});
