import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { NextRequest } from 'next/server';
import { db, order, capability, type Order } from '../lib/commerce.ts';
import { viewerCookie, sendViewerCode, verifyViewerCode, viewerState, startWatching, keepWatching, canStream, logoutViewer } from '../lib/viewer.ts';
import { GET, POST } from '../app/api/commerce/[...parts]/route.ts';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lady-viewer-'));process.env.COMMERCE_STATE=dir;
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({origin:'https://new.ladyzenko.ru',lectureFiles:{},lectureRemoteFiles:{'school-lecture-02':'school-lecture-02.mp4'},smtp:{host:'fixture',port:465,user:'fixture',password:'fixture',from:'fixture@example.test'}}));
const original=nodemailer.createTransport;let sentCode='';let sentTo='';
nodemailer.createTransport=(()=>({sendMail:async(message:any)=>{sentTo=message.to;sentCode=message.text.match(/\d{8}/)[0];return{};}})) as any;
after(()=>{nodemailer.createTransport=original;db().close();fs.rmSync(dir,{recursive:true,force:true});});
function fixture(email='buyer@example.test'){
  const id=randomBytes(16).toString('hex'),time=Math.floor(Date.now()/1000);
  db().prepare("INSERT INTO orders(id,product,email,amount,mode,created,status,paid_at,expires,access_days,request,consent) VALUES(?,'school-lecture-02',?,100000,'live',?,'succeeded',?,?,30,'{}','{}')").run(id,email,time,time,time+86400);
  return order(id)!;
}
async function login(row:Order,client='fixture'){await sendViewerCode(row,client);return verifyViewerCode(row,sentCode,client);}
const context=(row:Order,action:string)=>({params:Promise.resolve({parts:['orders',row.id,action]})});
function request(row:Order,action:string,session='',play='',data?:unknown){
  return new NextRequest('https://new.ladyzenko.ru/api/commerce/orders/'+row.id+'/'+action+(play?'?play='+play:''),{method:data?'POST':'GET',headers:{origin:'https://new.ladyzenko.ru',cookie:'order_'+row.id+'='+capability(row.id)+(session?'; '+viewerCookie+'='+session:''),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
}
test('a forwarded paid-order link cannot stream; OTP goes only to the purchase email and is single use',async()=>{
  const row=fixture();assert.equal((await GET(request(row,'media'),context(row,'media'))).status,403);
  await sendViewerCode(row,'one');assert.equal(sentTo,row.email);const code=sentCode;
  assert.equal(JSON.stringify(db().prepare('SELECT * FROM viewer_codes').all()).includes(code),false);
  assert.throws(()=>verifyViewerCode(row,'00000000'===code?'11111111':'00000000','one'),/Неверный/);
  const response=await POST(request(row,'verify-code','','',{code}),context(row,'verify-code'));
  assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')!,/HttpOnly/);assert.match(response.headers.get('set-cookie')!,/SameSite=strict/i);
  const token=response.cookies.get(viewerCookie)!.value;assert.equal(viewerState(row,token).verified,true);
  assert.throws(()=>verifyViewerCode(row,code,'one'),/истёк/);
  assert.equal((await GET(request(row,'media',token),context(row,'media'))).status,403);
  const play=startWatching(row,token,false).play;
  const media=await GET(request(row,'media',token,play),context(row,'media'));assert.equal(media.status,200);assert.equal(media.headers.get('x-accel-redirect'),'/commerce-remote/school-lecture-02.mp4');
  assert.equal((await GET(request(row,'media','',play),context(row,'media'))).status,403);
  const other=fixture('other@example.test');assert.equal(canStream(other,token,play),false);
});
test('one player lease and one login per buyer; takeover, expiry, refunds and logout revoke media',async()=>{
  const row=fixture('session@example.test'),token=await login(row,'two');const first=startWatching(row,token,false).play;
  assert.throws(()=>startWatching(row,token,false),/другой вкладке/);
  const second=startWatching(row,token,true).play;assert.equal(canStream(row,token,first),false);assert.equal(canStream(row,token,second),true);
  assert.throws(()=>keepWatching(row,token,first),/завершён/);
  const next=await login(row,'three');assert.equal(viewerState(row,token).verified,false);assert.equal(canStream(row,token,second),false);
  const active=startWatching(row,next,false).play;
  db().prepare('UPDATE viewer_sessions SET lease_until=0 WHERE email=?').run(row.email);assert.equal(canStream(row,next,active),false);
  const fresh=startWatching(row,next,false).play;
  db().prepare("UPDATE orders SET status='refunded' WHERE id=?").run(row.id);assert.equal(canStream(order(row.id)!,next,fresh),false);
  db().prepare("UPDATE orders SET status='succeeded',expires=0 WHERE id=?").run(row.id);assert.equal(canStream({...order(row.id)!,expires:1},next,fresh),false);
  logoutViewer(next);assert.equal(viewerState(row,next).verified,false);
});
test('code guessing, cooldown, SMTP errors and unpaid orders never grant a session',async()=>{
  const row=fixture('limits@example.test');await sendViewerCode(row,'four');const correct=sentCode;
  await assert.rejects(sendViewerCode(row,'four'),/через минуту/);
  for(let i=0;i<5;i++)assert.throws(()=>verifyViewerCode(row,correct==='00000000'?'11111111':'00000000','four'));
  assert.throws(()=>verifyViewerCode(row,correct,'four'),/исчерпаны/);
  const expired=fixture('expired@example.test');await sendViewerCode(expired,'five');db().prepare('UPDATE viewer_codes SET expires=0 WHERE order_id=?').run(expired.id);assert.throws(()=>verifyViewerCode(expired,sentCode,'five'),/истёк/);
  const pending=fixture('pending@example.test');db().prepare("UPDATE orders SET status='pending' WHERE id=?").run(pending.id);await assert.rejects(sendViewerCode(order(pending.id)!,'six'),/не оплачен/);
  nodemailer.createTransport=(()=>({sendMail:async()=>{throw Error('smtp secret should never be exposed');}})) as any;
  const failed=fixture('failed@example.test');await assert.rejects(sendViewerCode(failed,'seven'),/Не удалось отправить/);assert.equal(db().prepare('SELECT * FROM viewer_codes WHERE order_id=?').get(failed.id),undefined);
});
