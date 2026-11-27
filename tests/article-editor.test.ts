import { after,test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { articleEditor,articleList,contentPage,localFeed,renderMirror,saveArticle,saveContent } from '../lib/mirror.ts';

const origin='https://new.ladyzenko.ru';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lady-articles-'));
process.env.COMMERCE_STATE=dir;
after(()=>fs.rmSync(dir,{recursive:true,force:true}));

test('all archived articles open in the rich editor and unchanged publication preserves the original',()=>{
  const library=articleList(true);
  assert.equal(library.length,85);
  for(const p of library){
    const article=articleEditor(p.slug);
    assert.ok(article.sections.length,p.slug);
    assert.ok(article.headline.trim(),p.slug);
    const before=renderMirror(p.slug,origin);
    saveArticle({...article,edits:{},operation:'publish'});
    assert.equal(contentPage(p.slug).published,null,p.slug);
    assert.ok(renderMirror(p.slug,origin)===before,p.slug);
  }
});
test('rich edits preserve imported media, prior CMS edits, publication dates and previous-version recovery',()=>{
  const slug='tpost-067pkfbdc1-ustoichivost-k-neopredelnnosti';
  const page=contentPage(slug);
  const heading=page.blocks.find(b=>b.label==='h1')!;
  saveContent({...page,values:{[heading.id]:'Заголовок из CMS'},operation:'publish'});
  const initial=articleEditor(slug);
  assert.equal(initial.headline,'Заголовок из CMS');
  const before=renderMirror(slug,origin);
  const edit=saveArticle({...initial,edits:{0:'<h2>Подзаголовок</h2><p><strong>Фрагмент</strong></p>'},operation:'draft'})!;
  assert.ok(renderMirror(slug,origin)===before);
  assert.match(renderMirror(slug,origin,true),/<h2>Подзаголовок/);
  saveArticle({...edit,edits:{},operation:'publish'});
  const after=renderMirror(slug,origin);
  assert.match(after,/<strong>Фрагмент/);
  assert.deepEqual(after.match(/<figure[^>]*>[\s\S]*?<\/figure>/g),before.match(/<figure[^>]*>[\s\S]*?<\/figure>/g));
  assert.equal(after.match(/"datePublished":"([^"]+)"/)?.[1],before.match(/"datePublished":"([^"]+)"/)?.[1]);
  saveContent({...contentPage(slug),operation:'restore'});
  assert.doesNotMatch(renderMirror(slug,origin),/<h2>Подзаголовок/);
});
test('new articles stay private until publication, feed and catalogue update, repeat publishes retain dates',()=>{
  const edits={0:'<h2>Раздел</h2><p>Первый <em>абзац</em>.</p><img src="about:blank" onerror="bad()"><script>bad()</script>'};
  const draft=saveArticle({headline:'Статья для проверки',title:'',description:'',operation:'draft',edits})!;
  assert.ok(draft.draft&&!draft.live);
  assert.ok(articleList(true).some(p=>p.slug===draft.slug));
  assert.ok(!articleList().some(p=>p.slug===draft.slug));
  assert.throws(()=>renderMirror(draft.slug,origin),/не найдена/);
  assert.doesNotMatch(renderMirror(draft.slug,origin,true),/bad\(\)|about:blank/);
  const live=saveArticle({...draft,operation:'publish',edits:{}})!;
  assert.throws(()=>saveArticle({...draft,operation:'draft',edits:{}}),/изменилась/);
  assert.ok(live.live&&!live.draft);
  const publicHtml=renderMirror(live.slug,origin);
  assert.match(publicHtml,/<h2>Раздел<\/h2>/);
  assert.match(publicHtml,/"datePublished"/);
  const feed=localFeed(new URLSearchParams({feeduid:'389330281011'}));
  assert.equal(feed.posts[0].url,live.path);
  assert.equal(localFeed(new URLSearchParams({postuid:feed.posts[0].uid,action:'post'})).post.text,live.sections[0]);
  assert.ok(articleList().some(p=>p.path===live.path&&p.title===live.headline));
  saveArticle({...live,edits:{},operation:'publish'});
  assert.ok(renderMirror(live.slug,origin)===publicHtml);
  const abandoned=saveArticle({headline:'Другой материал',title:'',description:'',operation:'draft',edits:{}})!;
  saveArticle({...abandoned,operation:'discard'});
  assert.ok(!articleList(true).some(p=>p.slug===abandoned.slug));
});

test('article list uses the published image and does not expose draft changes',()=>{
  const image='/api/site/image/0123456789abcdef0123456789abcdef.jpg';
  const draft=saveArticle({headline:'Обложка для проверки',title:'',description:'',operation:'draft',edits:{0:`<p>Текст</p><img src="${image}">`}})!;
  assert.equal(articleList(true).find(p=>p.slug===draft.slug)?.image,image);
  const live=saveArticle({...draft,operation:'publish',edits:{}})!;
  assert.equal(articleList().find(p=>p.slug===live.slug)?.image,image);
  saveArticle({...live,operation:'draft',edits:{0:'<p>Новый текст без обложки</p>'}});
  assert.equal(articleList().find(p=>p.slug===live.slug)?.image,image);
  assert.equal(articleList(true).find(p=>p.slug===live.slug)?.image,'');
});

