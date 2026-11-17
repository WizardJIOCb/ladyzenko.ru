import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { CommerceError, stateDir, config, available } from './commerce.ts';
import { siteAnchors } from './site-anchors.ts';
import { lectureProducts, consultations, formatPrice } from './products.ts';

export type MirrorBlock = { id: string; type: 'text' | 'image' | 'link'; value: string; label: string };
export type MirrorPage = { slug: string; path: string; title: string; sourceStatus: string; blocks: MirrorBlock[] };
type Changes = { title: string; description: string; values: Record<string,string>; updated: string };
const root = () => path.join(process.cwd(), 'mirror');
const content = () => path.join(stateDir(), 'content');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
let schoolVideos: Map<string,string> | undefined;
function schoolVideoProducts() {
  if (schoolVideos) return schoolVideos;
  schoolVideos=new Map();
  const course=fs.readFileSync(path.join(root(),'pages','sckolaotzov.html'),'utf8');
  const all=new Set([...course.matchAll(/data-rutubeid="([a-f0-9]{32})[^\"]*"/g)].map(m=>m[1]));
  for(let n=1;n<=13;n++) {
    const page=path.join(root(),'pages','lekciya_'+n+'.html');
    if(!fs.existsSync(page))continue;
    const ids=[...fs.readFileSync(page,'utf8').matchAll(/data-rutubeid="([a-f0-9]{32})[^\"]*"/g)];
    for(const m of ids)if(all.has(m[1]))schoolVideos.set(m[1],'school-lecture-'+String(n).padStart(2,'0'));
  }
  const remaining=[...all].filter(id=>!schoolVideos!.has(id));
  // The exported course has no separate page for lecture seven.
  if(remaining.length===1&&schoolVideos.size===12)schoolVideos.set(remaining[0],'school-lecture-07');
  return schoolVideos;
}
function protectSchoolVideos(html:string) {
  const ids=schoolVideoProducts();let changed=false;
  html=html.replace(/<div\b[^>]*\b(?:data-rutubeid|data-videolazy-id)="([^\"]+)"[^>]*>\s*<\/div>/g,(tag,value:string)=>{
    const product=ids.get(value.split('?')[0]);if(!product)return tag;changed=true;
    return '<div class="protected-recording"><a href="/recordings/'+product+'">Полная запись: описание и покупка доступа на 30 дней</a></div>';
  });
  html=html.replace(/href="(?:https?:\/\/(?:www\.)?rutube\.ru\/[^\"]+|[a-f0-9]{32}\?[^\"]*)"/g,tag=>{
    for(const [id,product] of ids)if(tag.includes(id)){changed=true;return 'href="/recordings/'+product+'"';}return tag;
  });
  if(changed&&!html.includes('href="/commerce-catalog.css"'))html=html.replace('</head>','<link rel="stylesheet" href="/commerce-catalog.css"></head>');
  return html;
}
export const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function mirrorPages(): Omit<MirrorPage,'blocks'>[] { return JSON.parse(fs.readFileSync(path.join(root(),'manifest.json'),'utf8')); }
function source(slug: string): MirrorPage {
  if (!mirrorPages().some(p => p.slug === slug)) throw new CommerceError(404,'Страница не найдена.');
  return JSON.parse(fs.readFileSync(path.join(root(),'pages',slug+'.json'),'utf8'));
}
function file(slug: string, draft = false) { source(slug); return path.join(content(), slug+(draft?'.draft':'')+'.json'); }
function read(slug: string, draft = false): Changes | null {
  const f = file(slug,draft); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f,'utf8')) : null;
}
function atomic(f: string, data: unknown) {
  fs.mkdirSync(path.dirname(f),{recursive:true,mode:0o700});
  const temp=f+'.'+randomBytes(8).toString('hex');
  fs.writeFileSync(temp,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600}); fs.renameSync(temp,f);
}
function revision(slug: string) { return digest(JSON.stringify({base:source(slug),published:read(slug),draft:read(slug,true)})); }
export function contentPage(slug: string) {
  const base=source(slug); const published=read(slug); const draft=read(slug,true);
  return { ...base, revision:revision(slug), published:published?.updated || null, draft: draft?.updated || null,
    title:draft?.title ?? published?.title ?? base.title, description:draft?.description ?? published?.description ?? '', values:draft?.values ?? published?.values ?? {} };
}
function validate(data: Record<string,unknown>, base: MirrorPage): Changes {
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length>500 || typeof data.description!=='string' || data.description.length>2000) throw new CommerceError(400,'Проверьте заголовок и описание.');
  if (!data.values || typeof data.values!=='object' || Array.isArray(data.values)) throw new CommerceError(400,'Некорректное содержимое.');
  const values: Record<string,string>={}; const blocks=new Map(base.blocks.map(b=>[b.id,b]));
  for (const [id,value] of Object.entries(data.values)) {
    const block=blocks.get(id);
    if (!block || typeof value!=='string' || value.length>50000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new CommerceError(400,'Некорректный блок страницы.');
    if (block.type!=='text' && !/^(\/(?!\/)|https?:\/\/|mailto:|tel:|#)/i.test(value)) throw new CommerceError(400,'Разрешены ссылки сайта, https, mailto и tel.');
    if (value!==block.value) values[id]=value;
  }
  return {title:data.title.trim(),description:data.description.trim(),values,updated:new Date().toISOString()};
}
export function saveContent(data: Record<string,unknown>) {
  if (typeof data.slug!=='string') throw new CommerceError(400,'Выберите страницу.');
  const base=source(data.slug);
  if (data.revision!==revision(base.slug)) throw new CommerceError(409,'Страница уже изменилась. Откройте её заново перед сохранением.');
  if (!['draft','publish','discard','restore'].includes(String(data.operation))) throw new CommerceError(400,'Неизвестное действие.');
  if (data.operation==='discard') {
    const f=file(base.slug,true); if(fs.existsSync(f)) fs.unlinkSync(f);
  } else if (data.operation==='restore') {
    const history=path.join(content(),'history',base.slug+'.json');
    if (!fs.existsSync(history)) throw new CommerceError(404,'Предыдущая версия отсутствует.');
    const previous=JSON.parse(fs.readFileSync(history,'utf8')); const current=read(base.slug);
    atomic(history,current); const f=file(base.slug);
    if(previous) atomic(f,previous); else if(fs.existsSync(f)) fs.unlinkSync(f);
    const draft=file(base.slug,true); if(fs.existsSync(draft))fs.unlinkSync(draft);
  } else {
    const next=validate(data,base);
    if(data.operation==='publish') {
      atomic(path.join(content(),'history',base.slug+'.json'),read(base.slug));
      atomic(file(base.slug),next); const draft=file(base.slug,true); if(fs.existsSync(draft))fs.unlinkSync(draft);
    } else atomic(file(base.slug,true),next);
  }
  return contentPage(base.slug);
}
function replaceChanges(html: string, base: MirrorPage, changes: Changes | null) {
  if (!changes) return html;
  for(const [id,value] of Object.entries(changes.values)) {
    const block=base.blocks.find(b=>b.id===id); if(!block)continue;
    if(block.type==='text') html=html.replace(new RegExp('<!--cms:'+id+'-->[\\s\\S]*?<!--/cms:'+id+'-->','g'),()=>escapeHtml(value).replace(/\n/g,'<br>'));
    else if(block.type==='image') html=html.split(block.value).join(escapeHtml(value));
    else html=html.replace(/<a\b[^>]*>/g,tag=>tag.includes('data-cms-link="'+id+'"')?tag.replace(/href="[^"]*"/,()=> 'href="'+escapeHtml(value)+'"'):tag);
  }
  html=html.replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+escapeHtml(changes.title)+'</title>');
  if(changes.description) html=html.replace(/<meta\b[^>]*name="description"[^>]*>/gi,'').replace(/<\/head>/i,()=>'<meta name="description" content="'+escapeHtml(changes.description)+'"></head>');
  return html;
}
export function renderMirror(slug: string, origin: string, preview=false) {
  const base=source(slug); let html=fs.readFileSync(path.join(root(),'pages',slug+'.html'),'utf8');
  html=replaceChanges(html,base,preview?(read(slug,true) || read(slug)):read(slug));
  html=protectSchoolVideos(html);
  html=html.replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'').replace(/<meta\b[^>]*property="og:url"[^>]*>/gi,'');
  const canonical=escapeHtml(origin+base.path);
  html=html.replace('</head>','<link rel="canonical" href="'+canonical+'"><meta property="og:url" content="'+canonical+'">'+(new URL(origin).hostname.startsWith('new.')||preview?'<meta name="robots" content="noindex, follow">':'')+'</head>');
  // Replace Tilda cart with the existing secure single-product checkout.
  html=html.replace(/<a\b[^>]*href="#order"[^>]*>[\s\S]*?<\/a>/g,tag=>tag.replace('href="#order"','href="/lectures"'));
  html=html.replace(/<a\b[^>]*href="#order:[^"]*"[^>]*>[\s\S]*?<\/a>/g,tag=>tag.replace(/href="[^"]*"/,'href="/lectures"').replace(/Купить/g,'Выбрать лекцию'));
  const commerce=config();
  const buyable=lectureProducts.filter(p=>available(p,commerce));
  if(base.slug==='index') {
    const catalog='<section class="live-recordings" aria-labelledby="live-recordings-title"><h2 id="live-recordings-title">Купить лекции в записи</h2><p>Доступ на 30 дней после оплаты. Видео откроется на личной странице заказа, ссылка придёт на почту.</p><div class="live-recordings-grid">'+buyable.map(p=>'<article><h3><a href="/recordings/'+p.id+'">'+escapeHtml(p.title)+'</a></h3><p>'+escapeHtml(p.duration||'Запись лекции')+'</p><a class="live-purchase" href="/checkout/'+p.id+'">Купить за '+escapeHtml(formatPrice(p.amount))+'</a></article>').join('')+'</div><p><a href="/lectures">Все лекции и доступность записей</a></p></section>';
    html=html.replace(/(<div\b[^>]*\bid="rec1043768191"[^>]*>)/,(_match,tag)=>tag+catalog);
    const services='<div class="live-recordings"><p>Оплата консультации после согласования даты и формата встречи:</p><div class="live-recordings-grid">'+consultations.filter(p=>available(p,commerce)).map(p=>'<a class="live-purchase" href="/checkout/'+p.id+'">'+escapeHtml(p.title)+' · '+escapeHtml(formatPrice(p.amount))+'</a>').join('')+'</div></div>';
    html=html.replace(/(<div\b[^>]*\bid="rec1161429401"[^>]*>)/,(_match,tag)=>tag+services);
    html=html.replace('</head>','<link rel="stylesheet" href="/commerce-catalog.css"></head>');
  }
  html=html.replace(/<a\b[^>]*href="\/checkout\/([^"/]+)"[^>]*>[\s\S]*?<\/a>/g,(tag,id:string)=>{
    const p=lectureProducts.find(p=>p.id===id);return p&&!available(p,commerce)?tag.replace(/Купить/g,'Проверить доступность'):tag;
  });
  // Apply after CMS edits so published links use the same readable section URLs.
  html=html.replace(/href="([^"]*)"/g,(attribute,href:string)=>{
    try {
      const url=new URL(href.replace(/&amp;/g,'&'),origin+base.path);
      if(![new URL(origin).hostname,'ladyzenko.ru','www.ladyzenko.ru','new.ladyzenko.ru'].includes(url.hostname))return attribute;
      const anchor=siteAnchors[url.pathname.replace(/\/$/,'')||'/']?.find(a=>a.aliases.includes(url.hash.slice(1)));
      if(!anchor)return attribute;
      return 'href="'+escapeHtml((href.startsWith('#')?'':url.pathname+url.search)+'#'+anchor.id)+'"';
    } catch { return attribute; }
  });
  for(const anchor of siteAnchors[base.path]||[]) {
    const target=new RegExp('<div\\b[^>]*\\bid="'+anchor.target+'"[^>]*>');
    html=html.replace(target,tag=>tag+'<a id="'+anchor.id+'" name="'+anchor.id+'" data-legacy-anchors="'+anchor.aliases.join(' ')+'" aria-hidden="true" style="display:block;height:0"></a>');
  }
  if(preview) html=html.replace('<body','<body data-content-preview="true"');
  return html;
}
export function localFeed(params: URLSearchParams) {
  const requested=params.get(params.get('action')==='post'?'postuid':'feeduid') || '';
  const [uid,category]=requested.split('-');
  if(!/^[a-z0-9]{8,24}$/i.test(uid))throw new CommerceError(404,'Публикация не найдена.');
  const kind=params.get('action')==='post'?'post':'feed';
  const f=path.join(root(),'feeds',kind+'-'+uid+'.json');
  if(!fs.existsSync(f))throw new CommerceError(404,'Публикация не найдена.');
  const data=JSON.parse(fs.readFileSync(f,'utf8'));
  const overlay=(post:Record<string,any>)=>{
    const page=mirrorPages().find(p=>p.path===post.url);
    if(!page)return post;
    const changes=read(page.slug);if(!changes)return post;
    const base=source(page.slug);let text=String(post.text||'');
    for(const [id,value] of Object.entries(changes.values)){
      const b=base.blocks.find(b=>b.id===id);if(!b)continue;
      if(b.type==='text') {text=text.split(escapeHtml(b.value)).join(escapeHtml(value)).split(b.value).join(escapeHtml(value)); if(post.title===b.value)post.title=value; if(post.descr===b.value)post.descr=value;}
      else if(b.type==='image'){text=text.split(b.value).join(escapeHtml(value));if(post.image===b.value)post.image=value;}
    }
    return {...post,text};
  };
  if(kind==='post')return {post:overlay(data.post)};
  let posts=(data.posts as Record<string,any>[]).map(overlay);
  const part=category || params.get('filters[partuid]') || params.get('partuid');
  if(part && part!==uid) posts=posts.filter(p=>p.postparts?.some((x:Record<string,string>)=>x.partuid===part));
  const search=(params.get('filters[search]') || '').toLowerCase();
  if(search)posts=posts.filter(p=>(p.title+' '+p.descr).toLowerCase().includes(search));
  if(params.get('sort[date]')==='asc')posts=[...posts].reverse();
  const size=Math.min(480,Math.max(1,Number(params.get('size'))||8)); const slice=Math.max(1,Number(params.get('slice'))||1);
  return {...data,total:posts.length,size,slice,...(slice*size<posts.length?{nextslice:slice+1}:{}),posts:posts.slice((slice-1)*size,slice*size)};
}
export function saveSubmission(email: string, page: string) {
  const id=Date.now().toString(36)+'-'+randomBytes(6).toString('hex');
  atomic(path.join(content(),'inbox',id+'.json'),{id,email,page,created:new Date().toISOString()}); return id;
}
export function submissions() {
  const dir=path.join(content(),'inbox');
  return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort().reverse().slice(0,200).map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))):[];
}
export function storeImage(bytes:Buffer) {
  const ext=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'jpg':/^GIF8[79]a$/.test(bytes.subarray(0,6).toString())?'gif':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'?'webp':null;
  if(!ext)throw new CommerceError(400,'Выберите изображение PNG, JPEG, GIF или WebP.');
  const dir=path.join(content(),'uploads');fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const name=randomBytes(16).toString('hex')+'.'+ext;fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx',mode:0o600});return '/api/site/image/'+name;
}
export function readImage(name:string){
  if(!/^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(name))throw new CommerceError(404,'Изображение не найдено.');
  const f=path.join(content(),'uploads',name);if(!fs.existsSync(f))throw new CommerceError(404,'Изображение не найдено.');
  return {bytes:fs.readFileSync(f),type:'image/'+(name.endsWith('.jpg')?'jpeg':name.split('.').pop())};
}
