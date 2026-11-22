import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CommerceError, mediaDelivery, stateDir } from './commerce.ts';
import { lectureProducts } from './products.ts';

const directory=()=>path.join(stateDir(),'recording-previews');
const key=(name:string)=>createHash('sha256').update(name).digest('hex');
export function recordingMedia(product:string) {
  if(!lectureProducts.some(p=>p.id===product))return null;
  const delivery=mediaDelivery(product);if(!delivery)return null;
  const fileName=path.basename(delivery),id=key(fileName);
  let metadata:{fileName:string;bytes:number;duration:number;width:number;height:number}|undefined;
  try{const saved=JSON.parse(fs.readFileSync(path.join(directory(),id+'.json'),'utf8'));if(saved.fileName===fileName)metadata=saved;}catch{/* Preview generation may still be pending. */}
  return {fileName,storage:delivery.startsWith('/commerce-private/')?'local' as const:'remote' as const,
    sizeBytes:metadata?.bytes??null,durationSeconds:metadata?.duration??null,width:metadata?.width??null,height:metadata?.height??null,
    posterUrl:metadata&&fs.existsSync(path.join(directory(),id+'.jpg'))?'/api/admin/recording-poster?product='+encodeURIComponent(product)+'&v='+id.slice(0,16):null,
    previewUrl:'/api/admin/recording-video?product='+encodeURIComponent(product)};
}
export function recordingVideo(product:string){
  if(!lectureProducts.some(p=>p.id===product))throw new CommerceError(404,'Лекция не найдена.');
  const delivery=mediaDelivery(product);if(!delivery)throw new CommerceError(404,'Запись не подключена.');return delivery;
}
export function recordingPoster(product:string){
  const media=recordingMedia(product);if(!media?.posterUrl)throw new CommerceError(404,'Кадр пока не подготовлен.');
  return fs.readFileSync(path.join(directory(),key(media.fileName)+'.jpg'));
}
export function saveRecordingPreview(data:Record<string,unknown>){
  const media=recordingMedia(String(data.product));
  if(!media||data.fileName!==media.fileName)throw new CommerceError(409,'Подключённая запись изменилась.');
  if(!Number.isSafeInteger(data.bytes)||Number(data.bytes)<1024||!Number.isFinite(data.duration)||Number(data.duration)<30||Number(data.duration)>43200||
    !Number.isInteger(data.width)||!Number.isInteger(data.height)||Number(data.width)<1||Number(data.width)>16000||Number(data.height)<1||Number(data.height)>16000||
    typeof data.poster!=='string'||data.poster.length>110000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.poster))throw new CommerceError(400,'Некорректные данные предпросмотра.');
  const poster=Buffer.from(data.poster,'base64');
  if(poster.length>80*1024||poster.length<100||poster[0]!==255||poster[1]!==216||poster.at(-2)!==255||poster.at(-1)!==217)throw new CommerceError(400,'Нужен кадр JPEG.');
  fs.mkdirSync(directory(),{recursive:true,mode:0o700});const id=key(media.fileName);
  const image=path.join(directory(),id+'.jpg'),meta=path.join(directory(),id+'.json');
  fs.writeFileSync(image+'.tmp',poster,{mode:0o600});fs.renameSync(image+'.tmp',image);
  fs.writeFileSync(meta+'.tmp',JSON.stringify({fileName:media.fileName,bytes:data.bytes,duration:data.duration,width:data.width,height:data.height}),{mode:0o600});fs.renameSync(meta+'.tmp',meta);
  return {ok:true};
}
