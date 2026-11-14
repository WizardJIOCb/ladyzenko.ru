import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupAdmin, login, adminAuthorized, adminState, saveAdmin } from '../lib/admin.ts';
import { config, ready } from '../lib/commerce.ts';
import { profileGaps } from '../lib/legal.ts';
import { NextRequest } from 'next/server';
import { GET, POST } from '../app/api/admin/[action]/route.ts';
import { db } from '../lib/commerce.ts';
import { spawnSync } from 'node:child_process';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lady-admin-test-')); process.env.COMMERCE_STATE = dir;
const privateConfig = { origin:'http://localhost:3007', enabled:false, mode:'test', shopId:'123456', shopKey:'test_secret_must_stay_private', seller:'Known Seller', inn:'123456789012', contactEmail:'seller@example.test', legalApproved:true, fiscalizationConfirmed:false, lectureFiles:{}, smtp:{host:'local',user:'user',password:'private_smtp',from:'mail@example.test'} };
function save() { fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(privateConfig)); }
function draft() { const s = adminState(); return { ...s.profile, revision:s.revision, legalApproved:false, productionShopId:'1529009', adminNotes:'Missing address and status' }; }
after(() => { db().close(); fs.rmSync(dir, {recursive:true, force:true}); });
test('admin authentication rejects guessed, modified, expired and rotated sessions', () => {
  save();
  const setup = spawnSync(process.execPath, ['--import','tsx','scripts/setup-admin.ts'], {input:JSON.stringify({password:'first-long-test-password'}),encoding:'utf8',env:{...process.env,COMMERCE_STATE:dir}});
  assert.equal(setup.status,0,setup.stderr); assert.equal(setup.stdout.includes('first-long-test-password'),false);
  const token = login('first-long-test-password', 1800000000);
  assert.equal(adminAuthorized(token, 1800000001), true); assert.throws(() => login('incorrect'), /Неверный/);
  assert.equal(adminAuthorized(token.slice(0,-1) + (token.endsWith('a') ? 'b' : 'a'), 1800000001), false);
  assert.equal(adminAuthorized(token, 1800000000 + 8 * 3600), false);
  setupAdmin('second-long-test-password'); assert.equal(adminAuthorized(token,1800000001), false);
  assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir,'admin-auth.json'),'utf8'))).includes('second-long-test-password'),false);
});
test('admin response excludes payment and SMTP secrets and permits saving incomplete legal profile', () => {
  save(); const visible = JSON.stringify(adminState()); assert.equal(visible.includes('test_secret_must_stay_private'),false); assert.equal(visible.includes('private_smtp'),false);
  const next = saveAdmin(draft()); assert.ok(next.gaps.length >= 3); assert.equal(config().legalApproved,false);
  assert.equal(config().shopKey, privateConfig.shopKey); assert.equal(config().enabled,false); assert.equal(config().mode,'test'); assert.equal(config().fiscalizationConfirmed,false);
});
test('protected payment fields, stale writes and false completeness are rejected', () => {
  save(); const d = draft(); assert.throws(() => saveAdmin({...d,enabled:true}), /неподдерживаемые/);
  assert.throws(() => saveAdmin({...d,legalApproved:true}), /Сначала заполните/);
  saveAdmin(d); assert.throws(() => saveAdmin(d), /изменились/);
});
test('IP requires OGRNIP, NPD does not; complete profile can be approved without enabling payments', () => {
  save(); const d = { ...draft(), sellerStatus:'ip', postalAddress:'Actual postal address for buyers', sellerBasis:'Agreement with executor and copyright holder', sellerBasisConfirmed:true, legalApproved:true };
  assert.throws(() => saveAdmin(d), /ОГРНИП/);
  const saved = saveAdmin({...d,sellerStatus:'selfemployed'}); assert.deepEqual(saved.gaps,[]); assert.equal(config().legalApproved,true); assert.equal(ready(),false);
  const live = {...config(),enabled:true,mode:'live' as const,fiscalizationConfirmed:true}; assert.equal(ready(live),true);
  assert.ok(profileGaps({...live,postalAddress:''}).length); assert.equal(ready({...live,postalAddress:''}),false);
});
test('HTTP admin boundary requires a session and same origin; cookie is private and responses never expose secrets', async () => {
  save();
  const insert=db().prepare('INSERT INTO orders(id,product,email,amount,mode,created,status,request,consent,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
  insert.run('a'.repeat(32),'diagnostic','real-buyer@example.test',200000,'live',1,'succeeded','{}','{}',2);
  insert.run('b'.repeat(32),'diagnostic','sandbox-buyer@example.test',200000,'test',1,'succeeded','{}','{}',2);
  const ctx = (action:string) => ({ params:Promise.resolve({action}) });
  assert.equal((await GET(new NextRequest('http://localhost:3007/api/admin/settings'),ctx('settings'))).status,401);
  const request = (action:string, body:unknown, origin='http://localhost:3007', cookie='') => new NextRequest('http://localhost:3007/api/admin/'+action, {method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await POST(request('login',{password:'second-long-test-password'},'https://attacker.test'),ctx('login'))).status,403);
  const response = await POST(request('login',{password:'second-long-test-password'}),ctx('login')); assert.equal(response.status,200);
  const cookie = response.headers.get('set-cookie')!; assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=strict/);
  const session = cookie.split(';')[0];
  const read = await GET(new NextRequest('http://localhost:3007/api/admin/settings',{headers:{cookie:session}}),ctx('settings'));
  assert.equal(read.status,200); assert.match(read.headers.get('cache-control')!,/no-store/);
  const text = await read.text(); assert.equal(text.includes(privateConfig.shopKey),false); assert.equal(text.includes('private_smtp'),false);
  assert.equal(text.includes('real-buyer@example.test'),true);assert.equal(text.includes('sandbox-buyer@example.test'),false);
  assert.equal((await POST(request('settings',draft(),'https://attacker.test',session),ctx('settings'))).status,403);
  assert.equal((await POST(request('settings',{...draft(),shopKey:'overwrite'},'http://localhost:3007',session),ctx('settings'))).status,400);
  assert.equal(config().shopKey,privateConfig.shopKey);
});
