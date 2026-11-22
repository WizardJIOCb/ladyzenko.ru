import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { config, stateDir, CommerceError, available, mediaDelivery } from './commerce.ts';
import { lectureProducts } from './products.ts';
import { queueIndexNow } from './indexnow.ts';
import { recordingMedia, saveRecordingPreview } from './recording-media.ts';
import {getLectureProducts,detailsVersion} from './catalogue.ts';

type Job = { product:string; version:string; url:string; status:'queued'|'processing'|'ready'|'error'; updated:number; error?:string; bytes?:number; duration?:number };
const file = () => path.join(stateDir(),'recording-imports.json');
function jobs(): Record<string,Job> { return fs.existsSync(file()) ? JSON.parse(fs.readFileSync(file(),'utf8')) : {}; }
function write(file:string, value:unknown) {
  const temp=file+'.'+randomBytes(8).toString('hex');
  fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file);
}
export function recordingImports() {
  const all=jobs(), c=config();
  return getLectureProducts().map(p=>({id:p.id,title:p.title,description:p.description,amount:p.amount,image:p.coverImage||'',coverUrl:p.image||'',detailsVersion:detailsVersion(p),duration:p.duration||'',media:recordingMedia(p.id),connected:Boolean(mediaDelivery(p.id,c)),selling:!c.lectureSalesDisabled?.includes(p.id),available:available(p,c),job:all[p.id]||null}));
}
export function saveRecordingImport(data:Record<string,unknown>) {
  const p=lectureProducts.find(p=>p.id===data.product);
  if(!p || typeof data.url!=='string' || typeof data.selling!=='boolean')throw new CommerceError(400,'Выберите лекцию и ссылку на запись.');
  const all=jobs(), current=all[p.id];
  if((current?.version||'')!==data.version)throw new CommerceError(409,'Запись уже изменилась. Обновите список.');
  const url=data.url.trim();
  if(url.length>4096)throw new CommerceError(400,'Ссылка слишком длинная.');
  if(url) {
    let u:URL;try{u=new URL(url);}catch{throw new CommerceError(400,'Укажите полную HTTPS ссылку.');}
    if(u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || isIP(u.hostname.replace(/[\[\]]/g,'')) || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname))throw new CommerceError(400,'Нужна публичная HTTPS ссылка без пароля и нестандартного порта.');
  }
  if(url && (url!==current?.url || current.status==='error'))all[p.id]={product:p.id,version:randomBytes(8).toString('hex'),url,status:'queued',updated:Date.now()};
  if(!url && current?.status!=='ready')delete all[p.id];
  write(file(),all);
  const c=config();c.lectureSalesDisabled=[...(c.lectureSalesDisabled||[]).filter(id=>id!==p.id),...(data.selling?[]:[p.id])];
  write(path.join(stateDir(),'config.json'),c);
  queueIndexNow('/recordings/'+p.id);queueIndexNow('/lectures');
  return recordingImports();
}
export function importAuthorized(value:string) {
  const f=path.join(stateDir(),'media-source.json');if(!fs.existsSync(f))return false;
  const secret=JSON.parse(fs.readFileSync(f,'utf8')).secret;
  return typeof secret==='string' && Buffer.byteLength(value)===Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(value),Buffer.from(secret));
}
export async function importAction(data:Record<string,unknown>) {
  if(data.action==='preview')return saveRecordingPreview(data);
  const all=jobs();
  if(data.action==='claim') {
    const job=Object.values(all).find(j=>j.status==='queued'||(j.status==='processing'&&j.updated<Date.now()-6*3600000));
    if(!job)return {job:null};job.status='processing';job.updated=Date.now();write(file(),all);return {job};
  }
  const job=all[String(data.product)];
  if(!job || job.version!==data.version || job.status!=='processing')throw new CommerceError(409,'Задание уже изменилось.');
  if(data.action==='progress'){job.updated=Date.now();write(file(),all);return {ok:true};}
  if(data.action==='error') {
    const errors:Record<string,string>={download:'Не удалось скачать файл. Проверьте доступность ссылки без входа в аккаунт.',format:'Нужен полный MP4 с видео H.264 и звуком AAC. Ссылка на страницу или неподдерживаемый формат не подходят.',space:'На видеосервере недостаточно свободного места.',network:'Не удалось проверить доставку записи. Сохраните ссылку ещё раз для повтора.'};
    job.status='error';job.error=errors[String(data.code)]||errors.download;job.updated=Date.now();write(file(),all);return {ok:true};
  }
  if(data.action!=='complete' || !Number.isSafeInteger(data.bytes) || Number(data.bytes)<1024 || !Number.isFinite(data.duration) || Number(data.duration)<30 || data.decodedSamples!==3)throw new CommerceError(400,'Запись не прошла проверку.');
  const name=job.product+'-'+job.version+'.mp4';
  const secret=JSON.parse(fs.readFileSync(path.join(stateDir(),'media-source.json'),'utf8')).secret;
  const response=await fetch('http://127.0.0.1:38444/commerce-source/'+name,{headers:{'X-Ladyzenko-Source':secret,Range:'bytes=0-1023'},signal:AbortSignal.timeout(45000)});
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(response.status!==206 || response.headers.get('content-range')!==`bytes 0-1023/${data.bytes}` || bytes.length!==1024)throw new CommerceError(502,'Не удалось проверить доставку записи.');
  const latest=jobs();if(latest[job.product]?.version!==job.version)throw new CommerceError(409,'Ссылка изменилась во время загрузки.');
  const c=config();c.lectureRemoteFiles={...c.lectureRemoteFiles,[job.product]:name};write(path.join(stateDir(),'config.json'),c);
  latest[job.product]={...job,status:'ready',updated:Date.now(),bytes:Number(data.bytes),duration:Number(data.duration)};write(file(),latest);
  queueIndexNow('/recordings/'+job.product);queueIndexNow('/lectures');
  return {ok:true};
}
