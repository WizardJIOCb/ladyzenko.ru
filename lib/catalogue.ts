import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {lectureProducts,schoolProducts,consultations,type Product} from './products.ts';
import {CommerceError,stateDir} from './commerce.ts';
import {queueIndexNow} from './indexnow.ts';
type Details=Pick<Product,'title'|'description'|'amount'|'image'|'modified'>;
const file=()=>path.join(stateDir(),'lecture-details.json');
function overrides():Record<string,Details>{return fs.existsSync(file())?JSON.parse(fs.readFileSync(file(),'utf8')):{};}
export function getLectureProducts():Product[]{const all=overrides();return lectureProducts.map(p=>({...p,...all[p.id]}));}
export function getProducts():Product[]{return [...consultations,...getLectureProducts()];}
export function getSchoolProducts():Product[]{return getLectureProducts().filter(p=>schoolProducts.some(s=>s.id===p.id));}
export const detailsVersion=(p:Product)=>createHash('sha256').update(JSON.stringify([p.id,p.title,p.description,p.amount,p.image||''])).digest('hex');
export const hasLectureDetails=(id:string)=>Boolean(overrides()[id]);
export function saveLectureDetails(data:Record<string,unknown>){
  const current=getLectureProducts().find(p=>p.id===data.product);if(!current)throw new CommerceError(404,'Лекция не найдена.');
  if(data.version!==detailsVersion(current))throw new CommerceError(409,'Карточка уже изменилась. Обновите страницу перед сохранением.');
  if(typeof data.title!=='string'||!data.title.trim()||data.title.length>300||typeof data.description!=='string'||!data.description.trim()||data.description.length>12000||!Number.isSafeInteger(data.amount)||Number(data.amount)<100||Number(data.amount)>100000000||typeof data.image!=='string')throw new CommerceError(400,'Укажите название, описание и цену от 1 до 1 000 000 ₽.');
  const image=data.image;
  const seed=lectureProducts.find(p=>p.id===current.id)!;
  if(image&&image!==seed.image){
    const match=/^\/api\/site\/image\/([a-f0-9]{32}\.(?:png|jpg|gif|webp))$/.exec(image);
    if(!match||!fs.existsSync(path.join(stateDir(),'content','uploads',match[1])))throw new CommerceError(400,'Загрузите обложку через админку.');
  }
  const next={...current,title:data.title.trim(),description:data.description.trim(),amount:Number(data.amount),image};
  if(detailsVersion(next)===detailsVersion(current))return next;
  const all=overrides();all[current.id]={title:next.title,description:next.description,amount:next.amount,image,modified:new Date().toISOString()};
  fs.mkdirSync(stateDir(),{recursive:true,mode:0o700});if(fs.existsSync(file())){fs.copyFileSync(file(),file()+'.previous');fs.chmodSync(file()+'.previous',0o600);}const temp=file()+'.'+randomBytes(8).toString('hex');fs.writeFileSync(temp,JSON.stringify(all,null,2)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,file());
  queueIndexNow('/recordings/'+current.id);queueIndexNow('/lectures');queueIndexNow('/');
  return next;
}
