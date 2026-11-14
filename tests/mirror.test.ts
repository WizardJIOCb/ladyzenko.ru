import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { contentPage,saveContent,renderMirror,localFeed,mirrorPages,storeImage,readImage } from '../lib/mirror.ts';
import { setupAdmin,login } from '../lib/admin.ts';
import { GET as pageGET } from '../app/api/site/page/route.ts';
import { GET,POST } from '../app/api/admin/[action]/route.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lady-mirror-'));process.env.COMMERCE_STATE=dir;
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({origin:'http://localhost:3015'}));
after(()=>fs.rmSync(dir,{recursive:true,force:true}));

test('all source pages and full feed bodies are preserved without asset download errors',()=>{
  const report=JSON.parse(fs.readFileSync('mirror/report.json','utf8'));
  assert.equal(mirrorPages().length,114);assert.equal(report.assetErrors.length,0);
  for(const f of report.feeds){const data=localFeed(new URLSearchParams({feeduid:f.uid,size:'480'}));assert.equal(data.posts.length,f.posts);for(const post of data.posts){const full=localFeed(new URLSearchParams({postuid:post.uid,action:'post'}));assert.ok(full.post.text.length>0);}}
});
test('draft is private, publish applies escaped edits, stale writes fail and restore recovers original',()=>{
  const base=contentPage('index');const id=base.blocks.find(b=>b.type==='text')!.id;
  const marker='Migration <script>alert(1)</script>';
  const draft=saveContent({...base,operation:'draft',values:{[id]:marker}});
  assert.equal(renderMirror('index','https://new.ladyzenko.ru').includes('Migration &lt;script&gt;'),false);
  assert.equal(renderMirror('index','https://new.ladyzenko.ru',true).includes('Migration &lt;script&gt;'),true);
  assert.throws(()=>saveContent({...base,operation:'publish'}),/изменилась/);
  const published=saveContent({...draft,operation:'publish'});
  assert.ok(renderMirror('index','https://new.ladyzenko.ru').includes('Migration &lt;script&gt;'));
  assert.ok(!renderMirror('index','https://new.ladyzenko.ru').includes('<script>alert(1)</script>'));
  saveContent({...published,operation:'restore'});
  assert.equal(renderMirror('index','https://new.ladyzenko.ru').includes('Migration &lt;script&gt;'),false);
  assert.throws(()=>saveContent({...contentPage('index'),operation:'publish',values:{not_a_block:'x'}}),/блок/);
  const link=base.blocks.find(b=>b.type==='link')!;
  assert.throws(()=>saveContent({...contentPage('index'),operation:'publish',values:{[link.id]:'javascript:alert(1)'}}),/ссылки/);
});
test('feed category filtering and pagination use complete locally saved data',()=>{
  const all=localFeed(new URLSearchParams({feeduid:'389330281011',size:'480'}));
  const part=all.parts[0].uid;
  const subset=localFeed(new URLSearchParams({feeduid:'389330281011-'+part,size:'480'}));
  assert.ok(subset.posts.length>0&&subset.posts.length<all.posts.length);
  assert.ok(subset.posts.every((p:any)=>p.postparts.some((x:any)=>x.partuid===part)));
  const second=localFeed(new URLSearchParams({feeduid:'389330281011',size:'8',slice:'2'}));
  assert.equal(second.posts[0].uid,all.posts[8].uid);
  assert.equal(second.nextslice,3);
});
test('content API and draft preview enforce admin session and origin; uploads reject active documents',async()=>{
  const ctx=(action:string)=>({params:Promise.resolve({action})});
  assert.equal((await GET(new NextRequest('http://localhost:3015/api/admin/content'),ctx('content'))).status,401);
  assert.equal(pageGET(new NextRequest('http://localhost:3015/api/site/page?slug=index&preview=1')).status,401);
  setupAdmin('local-mirror-test-password');const token=login('local-mirror-test-password');
  const request=new NextRequest('http://localhost:3015/api/admin/content',{method:'POST',headers:{origin:'https://attacker.test',cookie:'ladyzenko_admin='+token,'Content-Type':'application/json'},body:'{}'});
  assert.equal((await POST(request,ctx('content'))).status,403);
  const read=await GET(new NextRequest('http://localhost:3015/api/admin/content?slug=index',{headers:{cookie:'ladyzenko_admin='+token}}),ctx('content'));
  assert.equal(read.status,200);assert.match(read.headers.get('cache-control')!,/no-store/);
  assert.throws(()=>storeImage(Buffer.from('<svg onload="alert(1)"></svg>')),/PNG/);
  assert.throws(()=>readImage('../../config.json'),/не найдено/);
  assert.throws(()=>contentPage('../../config'),/не найдена/);
  const image=storeImage(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64'));
  assert.equal(readImage(image.split('/').pop()!).type,'image/gif');
});
