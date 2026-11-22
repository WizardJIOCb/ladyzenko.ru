import {getLectureProducts} from './catalogue.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { CommerceError, stateDir, config, available } from './commerce.ts';
import { siteAnchors } from './site-anchors.ts';
import { formatPrice } from './products.ts';
import { applyMirrorSeo } from './mirror-seo.ts';
import { pageSeo,authorName } from './seo.ts';
import { articlePath, editableRegions, isNewArticle, newArticleHtml, newArticleSlug, sanitizeRegions, textRegions } from './article-format.ts';
import { excerpt, textOnly, seoPages } from './seo.ts';
import { queueIndexNow } from './indexnow.ts';

export type MirrorBlock = { id: string; type: 'text' | 'image' | 'link'; value: string; label: string };
export type MirrorPage = { slug: string; path: string; title: string; sourceStatus: string; blocks: MirrorBlock[] };
type Changes = { title: string; description: string; values: Record<string,string>; updated: string; rich?:Record<string,string>; firstPublished?:string };
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
  if (isNewArticle(slug)) return {slug,path:articlePath(slug),title:'',sourceStatus:'authored',blocks:[{id:'headline',label:'h1',type:'text',value:''}]};
  if (!mirrorPages().some(p => p.slug === slug)) throw new CommerceError(404,'Страница не найдена.');
  return JSON.parse(fs.readFileSync(path.join(root(),'pages',slug+'.json'),'utf8'));
}
function originalHtml(slug:string) {
  return isNewArticle(slug)?newArticleHtml:fs.readFileSync(path.join(root(),'pages',slug+'.html'),'utf8');
}
function file(slug: string, draft = false) { if(!/^[-a-zA-Z0-9_.]+$/.test(slug))throw new CommerceError(404,'Страница не найдена.'); return path.join(content(), slug+(draft?'.draft':'')+'.json'); }
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
  const changes=draft||published;
  const seo=pageSeo(slug,changes,base.title,replaceChanges(originalHtml(slug),base,changes));
  return { ...base, revision:revision(slug), published:published?.updated || null, draft: draft?.updated || null,
    title:seo.title, description:seo.description, values:draft?.values ?? published?.values ?? {} };
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
    if(isNewArticle(base.slug) && !previous)throw new CommerceError(404,'Предыдущая версия отсутствует.');
    atomic(history,current); const f=file(base.slug);
    atomic(f,{...(previous||{title:base.title,description:'',values:{}}),updated:new Date().toISOString()});
    const draft=file(base.slug,true); if(fs.existsSync(draft))fs.unlinkSync(draft);
    queueIndexNow(base.path);
  } else {
    const next=validate(data,base);
    const current=read(base.slug);
    if(base.path.startsWith('/tpost/')) {
      const originals=editableRegions(replaceChanges(originalHtml(base.slug),base,{...next,rich:undefined}));
      next.rich=sanitizeRegions(data.rich ?? (read(base.slug,true)||current)?.rich ?? {},originals);
      if(isNewArticle(base.slug)) {
        if(data.operation==='publish' && !textOnly(next.rich['0']||''))throw new CommerceError(400,'Добавьте текст статьи перед публикацией.');
        next.firstPublished=current?.firstPublished || (data.operation==='publish'?next.updated:undefined);
      }
    }
    if(data.operation==='publish') {
      const original=originalHtml(base.slug);
      const baseline=pageSeo(base.slug,current,base.title,replaceChanges(original,base,current));
      const values=(v:Record<string,string>)=>JSON.stringify(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)));
      const same=next.title===baseline.title && next.description===baseline.description && values(next.values)===values(current?.values||{}) && values(next.rich||{})===values(current?.rich||{});
      if(!same){if(current||!isNewArticle(base.slug))atomic(path.join(content(),'history',base.slug+'.json'),current);atomic(file(base.slug),next);queueIndexNow(base.path);}
      const draft=file(base.slug,true); if(fs.existsSync(draft))fs.unlinkSync(draft);
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
  if(changes.rich) {
    let index=0;
    html=html.replace(textRegions(),(full,open,_body,close)=>{
      const value=changes.rich?.[String(index++)];
      return value===undefined?full:open+value+close;
    });
  }
  html=html.replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+escapeHtml(changes.title)+'</title>');
  if(changes.description) html=html.replace(/<meta\b[^>]*name="description"[^>]*>/gi,'').replace(/<\/head>/i,()=>'<meta name="description" content="'+escapeHtml(changes.description)+'"></head>');
  return html;
}
// Keep the exported CMS blocks intact while publishing only the selected service.
function individualConsultationOnly(html: string) {
  const rows=[...html.matchAll(/<div class="t681__row t-row">/g)];
  for(const row of rows.reverse()) {
    const start=row.index!;const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;
    let depth=0;let end=start;
    for(let tag=tags.exec(html);tag;tag=tags.exec(html)) {
      depth+=tag[0].startsWith('</')?-1:1;
      if(depth===0){end=tags.lastIndex;break;}
    }
    const block=html.slice(start,end);
    if(/field="li_title__132967078821(?:0|2)"/.test(block))html=html.slice(0,start)+html.slice(end);
  }
  return html;
}
export function renderMirror(slug: string, origin: string, preview=false) {
  const base=source(slug);
  const changes=(preview && read(slug,true))||read(slug);
  if(isNewArticle(slug) && !changes)throw new CommerceError(404,'Статья не найдена.');
  let html=replaceChanges(originalHtml(slug),base,changes);
  if(isNewArticle(slug)||Object.keys(changes?.rich||{}).length)html=html.replace('</head>','<link rel="stylesheet" href="/article-layout.css"></head>');
  html=protectSchoolVideos(html);
  // Replace Tilda cart with the existing secure single-product checkout.
  html=html.replace(/<a\b[^>]*href="#order"[^>]*>[\s\S]*?<\/a>/g,tag=>tag.replace('href="#order"','href="/lectures"'));
  html=html.replace(/<a\b[^>]*href="#order:[^"]*"[^>]*>[\s\S]*?<\/a>/g,tag=>tag.replace(/href="[^"]*"/,'href="/lectures"').replace(/Купить/g,'Выбрать лекцию'));
  const commerce=config();
  const buyable=getLectureProducts().filter(p=>available(p,commerce));
  if(base.slug==='index') {
    const catalog='<section class="live-recordings" aria-labelledby="live-recordings-title"><h2 id="live-recordings-title">Купить лекции в записи</h2><p>Доступ на 30 дней после оплаты. Видео откроется на личной странице заказа, ссылка придёт на почту.</p><div class="live-recordings-grid">'+buyable.map(p=>'<article>'+(p.image?'<img class="live-recording-cover" src="'+escapeHtml(p.image)+'" alt="'+escapeHtml(p.title)+'" loading="lazy">':'')+'<h3><a href="/recordings/'+p.id+'">'+escapeHtml(p.title)+'</a></h3><p>'+escapeHtml(p.duration||'Запись лекции')+'</p><a class="live-purchase" href="/checkout/'+p.id+'">Купить за '+escapeHtml(formatPrice(p.amount))+'</a></article>').join('')+'</div><p><a href="/lectures">Все лекции и доступность записей</a></p></section>';
    html=html.replace(/(<div\b[^>]*\bid="rec1043768191"[^>]*>)/,(_match,tag)=>tag+catalog);
    html=individualConsultationOnly(html);
    html=html.replace('</head>','<link rel="stylesheet" href="/commerce-catalog.css"></head>');
  }
  html=html.replace(/<a\b[^>]*href="\/checkout\/([^"/]+)"[^>]*>[\s\S]*?<\/a>/g,(tag,id:string)=>{
    const p=getLectureProducts().find(p=>p.id===id);return p&&!available(p,commerce)?tag.replace(/Купить/g,'Проверить доступность'):tag;
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
  return applyMirrorSeo(html,slug,base.title,origin,changes,preview);
}
function authoredSlugs(includeDraft:boolean) {
  if(!fs.existsSync(content()))return [];
  const files=fs.readdirSync(content()).filter(f=>f.endsWith('.json') && (includeDraft || !f.endsWith('.draft.json')));
  return [...new Set(files.map(f=>f.replace(/(?:\.draft)?\.json$/,'')).filter(isNewArticle))];
}
export function articleList(admin=false) {
  const imported=mirrorPages().filter(p=>p.path.startsWith('/tpost/'));
  const pages=[...imported,...authoredSlugs(admin).map(source)];
  return pages.map(p=>{
    const live=read(p.slug);
    const draft=admin?read(p.slug,true):null;
    const changes=draft||live;
    const seo=seoPages()[p.slug];
    const titleBlock=changes?source(p.slug).blocks.find(b=>b.label==='h1'):null;
    const title=(titleBlock && changes?.values[titleBlock.id]) || seo?.headline || p.title;
    const description=changes?.description || (changes?.rich?excerpt(textOnly(Object.values(changes.rich).join(' '))):'') || seo?.description || '';
    const published=live?.firstPublished || seo?.published || '';
    return {slug:p.slug,path:p.path,title,description,published,modified:live?.updated||seo?.modified||'',draft:!!draft,live:!!live||!isNewArticle(p.slug)};
  }).sort((a,b)=>(b.published||'9999').localeCompare(a.published||'9999')||a.title.localeCompare(b.title,'ru'));
}
export function articleEditor(slug:string) {
  const base=source(slug);
  if(!base.path.startsWith('/tpost/'))throw new CommerceError(404,'Статья не найдена.');
  const live=read(slug);
  const draft=read(slug,true);
  if(isNewArticle(slug) && !live && !draft)throw new CommerceError(404,'Статья не найдена.');
  const changes=draft||live;
  const page=contentPage(slug);
  const heading=base.blocks.find(b=>b.label==='h1')!;
  const html=replaceChanges(originalHtml(slug),base,changes);
  return {slug,path:base.path,canRestore:fs.existsSync(path.join(content(),'history',slug+'.json')),revision:page.revision,headline:page.values[heading.id]??heading.value,
    title:page.title,description:page.description,sections:editableRegions(html),draft:!!draft,live:!!live||!isNewArticle(slug)};
}
export function saveArticle(data:Record<string,unknown>) {
  if(!['draft','publish','discard','restore'].includes(String(data.operation)))throw new CommerceError(400,'Неизвестное действие.');
  if(typeof data.headline!=='string'||!data.headline.trim()||data.headline.length>300)throw new CommerceError(400,'Введите заголовок до 300 символов.');
  const fresh=!data.slug;
  if(fresh && (data.operation==='discard'||data.operation==='restore'))throw new CommerceError(400,'Сначала сохраните черновик.');
  const slug=fresh?newArticleSlug(data.headline):String(data.slug);
  const base=source(slug);
  if(!base.path.startsWith('/tpost/'))throw new CommerceError(404,'Статья не найдена.');
  const page=contentPage(slug);
  const heading=base.blocks.find(b=>b.label==='h1')!;
  const previous=read(slug,true)||read(slug);
  const headline=data.headline.trim();
  const values={...page.values,[heading.id]:headline};
  const rich={...previous?.rich,...(typeof data.edits==='object'?data.edits:{})};
  const automaticTitle=headline+' | Людмила Ладыженко';
  const oldHeadline=page.values[heading.id]??heading.value;
  const title=data.title===oldHeadline+' | Людмила Ладыженко'||!data.title?automaticTitle:data.title;
  let description=data.description;
  if(!description) {
    const original=originalHtml(slug);
    const regions=editableRegions(replaceChanges(original,base,{title:'',description:'',updated:'',values}));
    const safe=sanitizeRegions(rich,regions);
    description=excerpt(textOnly(regions.map((region,i)=>safe[i]??region).join(' ')));
  }
  saveContent({...page,revision:fresh?page.revision:data.revision,operation:data.operation,title,description,values,rich});
  if(data.operation==='discard' && isNewArticle(slug) && !read(slug))return null;
  return articleEditor(slug);
}
export function localFeed(params: URLSearchParams) {
  const requested=params.get(params.get('action')==='post'?'postuid':'feeduid') || '';
  const [uid,category]=requested.split('-');
  if(!/^[a-z0-9]{8,24}$/i.test(uid))throw new CommerceError(404,'Публикация не найдена.');
  const kind=params.get('action')==='post'?'post':'feed';
  const f=path.join(root(),'feeds',kind+'-'+uid+'.json');
  const newPosts=()=>authoredSlugs(false).flatMap(slug=>{
    const changes=read(slug);
    if(!changes?.firstPublished)return [];
    const url=articlePath(slug);
    const body=changes.rich?.[0]||'';
    const image=body.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1]||'';
    const date=changes.firstPublished.replace('T',' ').slice(0,19);
    return [{uid:slug.split('-')[1],feeduid:'389330281011',url,directlink:url,title:escapeHtml(changes.values.headline),
      descr:escapeHtml(changes.description),text:body,date,published:date,parts:'',postparts:[],image,thumb:image,
      mediatype:image?'image':'',mediadata:image,authorname:authorName,authorurl:'/obo_mne',needGetPost:false}];
  }).sort((a,b)=>b.published.localeCompare(a.published));
  if(kind==='post' && /^cms[a-f0-9]{14}$/.test(uid)) {
    const post=newPosts().find(p=>p.uid===uid);
    if(post)return {post};
  }
  if(!fs.existsSync(f))throw new CommerceError(404,'Публикация не найдена.');
  const data=JSON.parse(fs.readFileSync(f,'utf8'));
  const overlay=(post:Record<string,any>)=>{
    post={...post,authorname:authorName,authorurl:'/obo_mne'};
    const page=mirrorPages().find(p=>p.path===post.url);
    if(!page)return post;
    const changes=read(page.slug);if(!changes)return post;
    const base=source(page.slug);let text=String(post.text||'');
    for(const [id,value] of Object.entries(changes.values)){
      const b=base.blocks.find(b=>b.id===id);if(!b)continue;
      if(b.type==='text') {text=text.split(escapeHtml(b.value)).join(escapeHtml(value)).split(b.value).join(escapeHtml(value)); if(post.title===b.value)post.title=escapeHtml(value); if(post.descr===b.value)post.descr=escapeHtml(value);}
      else if(b.type==='image'){text=text.split(b.value).join(escapeHtml(value));if(post.image===b.value)post.image=value;}
    }
    if(changes.rich && Object.keys(changes.rich).length) {
      const html=replaceChanges(originalHtml(page.slug),base,changes);
      text=html.match(/itemprop="articleBody"[^>]*><section>([\s\S]*?)<\/section>/)?.[1]||text;
      post.directlink=page.path;
    }
    if(changes.description)post.descr=escapeHtml(changes.description);
    return {...post,text};
  };
  if(kind==='post')return {post:overlay(data.post)};
  let posts:Record<string,any>[]=[...newPosts(),...(data.posts as Record<string,any>[]).map(overlay)];
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
