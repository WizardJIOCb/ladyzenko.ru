import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { checkout, config, db, order, settle, authorized, capability, webhook, publicOrder, available, mediaDelivery, ready, work } from '../lib/commerce.ts';
import { products } from '../lib/products.ts';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/commerce/[...parts]/route.ts';
const dir = fs.mkdtempSync(path.join(os.tmpdir(),'lady-commerce-test-'));
process.env.COMMERCE_STATE = dir;
const base = { origin:'http://localhost:3007', enabled:true, mode:'test',shopId:'123456',shopKey:'test_fake', seller:'Test Seller', inn:'123456789012', contactEmail:'seller@example.test', legalApproved:true, fiscalizationConfirmed:true,lectureFiles:{},smtp:{host:'localhost',port:465,user:'fake',password:'fake',from:'service@example.test'}, sellerStatus:'selfemployed', postalAddress:'Test business postal address', sellerBasis:'Test agreement with the author', sellerBasisConfirmed:true };
function save(extra:Record<string,unknown>={}) {fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({...base,...extra}));}
const id = ()=>randomBytes(16).toString('hex');
const data = (requestId=id())=>({ requestId, product:'diagnostic',email:'buyer@example.test',accepted:true,privacyAccepted:true,scheduled:true });
const payment = (body:any, key:string)=>({id:'provider-'+key,status:'pending',test:config().mode==='test',paid:false,amount:body.amount,metadata:body.metadata,recipient:{account_id:'123456'},confirmation:{confirmation_url:'https://yoomoney.ru/checkout/payments/v2/contract?orderId=fake'}});
const fetchOriginal = global.fetch; const mailOriginal=nodemailer.createTransport;
let requests:{method:string;key:string;body:any}[]=[]; const providerObjects=new Map<string,any>();
before(()=>{save();global.fetch=async(url,init)=>{
  const resource=String(url).split('/v3/')[1]; const method=init?.method || 'GET';
  const key=(init?.headers as Record<string,string>)?.['Idempotence-Key'] || '';
  const body=init?.body ? JSON.parse(String(init.body)):null;requests.push({method,key,body});
  if(method==='POST'){const obj=payment(body,key);providerObjects.set(obj.id,obj);return Response.json(obj);}
  return Response.json(providerObjects.get(resource.split('/')[1]));
};});
after(()=>{global.fetch=fetchOriginal;nodemailer.createTransport=mailOriginal;db().close(); fs.rmSync(dir,{recursive:true,force:true});});

test('disabled configuration and missing consent never create orders',async()=>{
  save({enabled:false});await assert.rejects(checkout(data(),'client'),/готовится/);save();
  await assert.rejects(checkout({...data(),accepted:false},'client'),/Подтвердите/);
  await assert.rejects(checkout({...data(),scheduled:false},'client'),/Подтвердите/);
});
test('live payments require approved documents and fiscalization; sandbox is explicitly separate',()=>{
  save({legalApproved:false,fiscalizationConfirmed:false});assert.equal(ready(),true);
  save({mode:'live',legalApproved:false,fiscalizationConfirmed:false});assert.equal(ready(),false);
  save({mode:'live',legalApproved:true,fiscalizationConfirmed:false});assert.equal(ready(),false);save();
});
test('server fixes price, saves immutable request, rejects replay without ownership',async()=>{
  const d=data();const row=await checkout({...d,amount:1},'price');assert.equal(row.amount,200000);
  assert.equal(JSON.parse(row.request).amount.value,'2000.00');
  await assert.rejects(checkout(d,'price'),/личную страницу/);
  await checkout(d,'price',capability(row.id));assert.equal(order(row.id)?.provider_id,row.provider_id);
  assert.equal(authorized(row.id,capability(row.id)),true);assert.equal(authorized(row.id,'0'.repeat(64)),false);
});
test('ambiguous provider POST reuses exact body and idempotency key',async()=>{
  const d=data();const mock=global.fetch;global.fetch=async()=>{throw new Error('timeout');};
  await assert.rejects(checkout(d,'timeout'),/связаться/); const snapshot=order(d.requestId)!.request;
  global.fetch=mock; await checkout(d,'timeout',capability(d.requestId));
  assert.equal(requests.at(-1)!.key,d.requestId);assert.equal(JSON.stringify(requests.at(-1)!.body),snapshot);
});
test('provider amount, merchant, metadata, mode, ID and paid flag are verified',async()=>{
  const row=await checkout(data(),'forgery'); const good=providerObjects.get(row.provider_id!);
  for(const bad of [{amount:{value:'1.00',currency:'RUB'}},{recipient:{account_id:'other'}},{metadata:{order_id:id()}},{test:false},{id:'other-payment-12345'},{status:'succeeded',paid:false},{confirmation:{confirmation_url:'https://attacker.test/pay'}}]) {
    assert.throws(()=>settle(row.id,{...good,...bad})); assert.equal(order(row.id)!.status,'pending');
  }
});
test('test success is idempotent and grants no real service or mail',async()=>{
  const row=await checkout(data(),'sandbox');const obj={...providerObjects.get(row.provider_id!),status:'succeeded',paid:true};
  settle(row.id,obj);const first=order(row.id)!.paid_at;settle(row.id,obj);
  assert.equal(order(row.id)!.paid_at,first);assert.equal(publicOrder(order(row.id)!).canWatch,false);
  assert.equal(db().prepare('SELECT * FROM outbox WHERE order_id=?').get(row.id),undefined);
});
test('webhook ignores supplied success and uses authenticated current provider object',async()=>{
  const row=await checkout(data(),'webhook');
  await webhook({type:'notification',event:'payment.succeeded',object:{id:row.provider_id,status:'succeeded',paid:true}});
  assert.equal(order(row.id)!.status,'pending');
  const obj=providerObjects.get(row.provider_id!);obj.status='succeeded';obj.paid=true;
  await webhook({type:'notification',event:'payment.succeeded',object:{id:row.provider_id}});
  assert.equal(order(row.id)!.status,'succeeded');
});
test('lecture needs private file, has 30 days, full refund closes access once',async()=>{
  const p=products.find(p=>p.kind==='lecture')!;save({mode:'live'});assert.equal(available(p),false);
  fs.mkdirSync(path.join(dir,'media'));fs.writeFileSync(path.join(dir,'media','test.mp4'),'fixture');save({mode:'live',lectureFiles:{[p.id]:'test.mp4'}});
  const row=await checkout({...data(),product:p.id},'lecture');const obj=providerObjects.get(row.provider_id!);obj.status='succeeded';obj.paid=true;
  settle(row.id,obj);assert.equal(order(row.id)!.expires!-order(row.id)!.paid_at!,30*86400);assert.equal(publicOrder(order(row.id)!).canWatch,true);
  const refundId='refund-01234567890';providerObjects.set(refundId,{id:refundId,payment_id:row.provider_id,status:'succeeded',amount:{value:(p.amount/100).toFixed(2),currency:'RUB'}});
  for(let i=0;i<2;i++) await webhook({type:'notification',event:'refund.succeeded',object:{id:refundId}});
  assert.equal(order(row.id)!.status,'refunded');assert.equal(publicOrder(order(row.id)!).canWatch,false);
  assert.equal((db().prepare('SELECT COUNT(*) n FROM refunds WHERE order_id=?').get(row.id) as {n:number}).n,1);
  save();
});
test('live consultation queues confirmation, worker sends once and persists success',async()=>{
  save({mode:'live',fiscalizationMethod:'npd_manual'});const row=await checkout(data(),'live');assert.equal('receipt' in JSON.parse(row.request),false);const obj={...providerObjects.get(row.provider_id!),status:'succeeded',paid:true};settle(row.id,obj);settle(row.id,obj);
  let sent=0;nodemailer.createTransport=(()=>({sendMail:async(message:any)=>{assert.match(message.text,/личная страница/);assert.match(message.text,/Мой налог/);sent++;return{};}})) as any;
  await work();await work();assert.equal(sent,1);assert.equal(publicOrder(order(row.id)!).mailSent,true);save();
});

test('remote recordings require a safe configured filename and paid ownership; expiry and refund close HTTP access', async()=>{
  const p=products.find(p=>p.id==='school-lecture-02')!;
  const mapping={[p.id]:'school-lecture-02.mp4'};
  save({mode:'live',lectureRemoteFiles:mapping});assert.equal(available(p),true);
  assert.equal(mediaDelivery(p.id),'/commerce-remote/school-lecture-02.mp4');
  for(const name of ['../secret.mp4','https://other.test/a.mp4','a.mp4?key=x','a/b.mp4','a.mp4\r\nX-Header: x']) {
    save({mode:'live',lectureRemoteFiles:{[p.id]:name}});assert.equal(available(p),false);
  }
  save({mode:'live',lectureRemoteFiles:mapping});
  const row=await checkout({...data(),product:p.id},'remote');
  const ctx={params:Promise.resolve({parts:['orders',row.id,'media']})};
  const request=(owned=true)=>new NextRequest(base.origin+'/api/commerce/orders/'+row.id+'/media',
    {headers:owned?{cookie:'order_'+row.id+'='+capability(row.id)}:{}});
  assert.equal((await GET(request(false),ctx)).status,403);
  assert.equal((await GET(request(),ctx)).status,403);
  const obj={...providerObjects.get(row.provider_id!),status:'succeeded',paid:true};settle(row.id,obj);
  assert.equal(row.amount,100000);
  // A paid order capability alone no longer opens the media; viewer.test covers OTP + lease.
  const response=await GET(request(),ctx);assert.equal(response.status,403);
  assert.match(response.headers.get('cache-control')!,/no-store/);
  db().prepare('UPDATE orders SET expires=? WHERE id=?').run(Math.floor(Date.now()/1000)-1,row.id);
  assert.equal((await GET(request(),ctx)).status,403);
  db().prepare("UPDATE orders SET expires=?,status='refunded' WHERE id=?").run(Math.floor(Date.now()/1000)+86400,row.id);
  assert.equal((await GET(request(),ctx)).status,403);
  db().prepare("UPDATE orders SET status='succeeded',mode='test' WHERE id=?").run(row.id);
  assert.equal((await GET(request(),ctx)).status,403);save();
});
