import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import nodemailer from 'nodemailer';
import { capability, CommerceError, config, db, publicOrder, type Order } from './commerce.ts';

export const viewerCookie='ladyzenko_viewer';
const now=()=>Math.floor(Date.now()/1000);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const equal=(a:string,b:string)=>a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
type Session={email:string;token_hash:string;expires:number;lease_hash:string|null;lease_until:number|null;lease_order:string|null};
function schema(){
  db().exec(`CREATE TABLE IF NOT EXISTS viewer_codes(order_id TEXT PRIMARY KEY,digest TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL,sent_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS viewer_sessions(email TEXT PRIMARY KEY,token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,lease_hash TEXT,lease_until INTEGER,lease_order TEXT);
    CREATE TABLE IF NOT EXISTS viewer_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,window INTEGER NOT NULL);`);
}
function session(token:string):Session|undefined{
  schema();if(!/^[a-f0-9]{64}$/.test(token))return;
  return db().prepare('SELECT * FROM viewer_sessions WHERE token_hash=? AND expires>?').get(hash(token),now()) as Session|undefined;
}
function limited(key:string,max:number){
  const window=Math.floor(now()/3600);const row=db().prepare(`INSERT INTO viewer_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count`).get(hash(key),window) as {count:number};
  db().prepare('DELETE FROM viewer_limits WHERE window<?').run(window-24);
  if(row.count>max)throw new CommerceError(429,'Слишком много попыток входа. Попробуйте через час.');
}
function entitled(row:Order){if(!publicOrder(row).canWatch)throw new CommerceError(403,'Доступ к записи не оплачен или истёк.');}
export function viewerState(row:Order,token:string){
  const s=session(token);const verified=Boolean(s&&s.email===row.email);
  const [local,domain]=row.email.split('@');
  return {verified,email:verified?row.email:local.slice(0,2)+'***@'+domain};
}
export async function sendViewerCode(row:Order,client:string){
  schema();entitled(row);const time=now();
  const previous=db().prepare('SELECT sent_at FROM viewer_codes WHERE order_id=?').get(row.id) as {sent_at:number}|undefined;
  if(previous && previous.sent_at>time-60)throw new CommerceError(429,'Код уже отправлен. Новый можно запросить через минуту.');
  limited('send-ip:'+client,12);limited('send-email:'+row.email,5);
  const code=String(randomInt(0,100000000)).padStart(8,'0');const nonce=randomBytes(16).toString('hex');
  db().prepare(`INSERT INTO viewer_codes VALUES(?,?,?,?,0,?) ON CONFLICT(order_id) DO UPDATE SET digest=excluded.digest,nonce=excluded.nonce,expires=excluded.expires,attempts=0,sent_at=excluded.sent_at`).run(row.id,capability('viewer-code:'+nonce+':'+code),nonce,time+600,time);
  db().prepare('DELETE FROM viewer_codes WHERE expires<?').run(time);
  const c=config();if(!c.smtp)throw new CommerceError(503,'Не удалось отправить код. Обратитесь в поддержку.');
  try{
    const transport=nodemailer.createTransport({host:c.smtp.host,port:c.smtp.port,secure:c.smtp.port===465,auth:{user:c.smtp.user,pass:c.smtp.password},connectionTimeout:10000,socketTimeout:20000});
    await transport.sendMail({from:c.smtp.from,to:row.email,subject:'Код для просмотра лекций',text:`Ваш код для входа: ${code}\nКод действует 10 минут. Не передавайте его другим людям.\nВход завершит предыдущий сеанс просмотра на другом устройстве.\nЕсли вы не запрашивали код, не сообщайте его никому.\nПоддержка: ${c.contactEmail}`});
  }catch{
    db().prepare('DELETE FROM viewer_codes WHERE order_id=? AND nonce=?').run(row.id,nonce);
    throw new CommerceError(503,'Не удалось отправить код. Попробуйте позже или обратитесь в поддержку.');
  }
  return {ok:true};
}
export function verifyViewerCode(row:Order,code:unknown,client:string){
  schema();entitled(row);limited('verify-ip:'+client,30);
  const saved=db().prepare('SELECT * FROM viewer_codes WHERE order_id=?').get(row.id) as {digest:string;nonce:string;expires:number;attempts:number}|undefined;
  if(!saved || saved.expires<=now() || saved.attempts>=5)throw new CommerceError(403,'Код истёк или исчерпаны попытки. Запросите новый код.');
  db().prepare('UPDATE viewer_codes SET attempts=attempts+1 WHERE order_id=?').run(row.id);
  if(typeof code!=='string'||!/^\d{8}$/.test(code)||!equal(saved.digest,capability('viewer-code:'+saved.nonce+':'+code)))throw new CommerceError(403,'Неверный код. Проверьте письмо и попробуйте ещё раз.');
  const token=randomBytes(32).toString('hex');
  db().exec('BEGIN IMMEDIATE');
  try{
    db().prepare('DELETE FROM viewer_codes WHERE order_id IN (SELECT id FROM orders WHERE email=?)').run(row.email);
    db().prepare(`INSERT INTO viewer_sessions(email,token_hash,expires) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET token_hash=excluded.token_hash,expires=excluded.expires,lease_hash=NULL,lease_until=NULL,lease_order=NULL`).run(row.email,hash(token),now()+30*86400);
    db().prepare('DELETE FROM viewer_sessions WHERE expires<?').run(now());db().exec('COMMIT');
  }catch(e){db().exec('ROLLBACK');throw e;}
  return token;
}
function ownedSession(row:Order,token:string){entitled(row);const s=session(token);if(!s||s.email!==row.email)throw new CommerceError(401,'Подтвердите почту покупки. Другой вход завершает предыдущий сеанс.');return s;}
export function startWatching(row:Order,token:string,takeover:boolean){
  const s=ownedSession(row,token);
  if(s.lease_hash && Number(s.lease_until)>now() && !takeover)throw new CommerceError(409,'Просмотр уже открыт в другой вкладке. Можно завершить его и смотреть здесь.');
  const play=randomBytes(32).toString('hex');db().prepare('UPDATE viewer_sessions SET lease_hash=?,lease_until=?,lease_order=? WHERE token_hash=?').run(hash(play),now()+75,row.id,s.token_hash);
  return {play,email:row.email};
}
export function canStream(row:Order,token:string,play:string){
  if(!publicOrder(row).canWatch || !/^[a-f0-9]{64}$/.test(play))return false;
  const s=session(token);return Boolean(s&&s.email===row.email&&s.lease_order===row.id&&Number(s.lease_until)>now()&&s.lease_hash===hash(play));
}
export function keepWatching(row:Order,token:string,play:string){
  ownedSession(row,token);
  if(!canStream(row,token,play))throw new CommerceError(409,'Сеанс просмотра завершён или открыт в другом месте. Откройте просмотр заново.');
  db().prepare('UPDATE viewer_sessions SET lease_until=? WHERE token_hash=?').run(now()+75,hash(token));return {ok:true};
}
export function stopWatching(token:string,play:string){
  schema();db().prepare('UPDATE viewer_sessions SET lease_hash=NULL,lease_until=NULL,lease_order=NULL WHERE token_hash=? AND lease_hash=?').run(hash(token),hash(play));return {ok:true};
}
export function logoutViewer(token:string){schema();db().prepare('DELETE FROM viewer_sessions WHERE token_hash=?').run(hash(token));return {ok:true};}
