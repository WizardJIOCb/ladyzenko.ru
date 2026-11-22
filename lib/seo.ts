import fs from 'node:fs';
import path from 'node:path';
import type { Product } from './products.ts';

export const authorName = 'Людмила Ивановна Ладыженко';
export type PageSeo = { path:string; headline:string; title:string; description:string; article?:boolean; image?:string; published?:string; modified?:string };
let cache: Record<string,PageSeo> | undefined;
export function seoPages() { return cache ??= JSON.parse(fs.readFileSync(path.join(process.cwd(),'mirror/seo.json'),'utf8')); }
export const textOnly = (html:string) => html.replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
export const excerpt = (text:string) => text.length>200 ? text.slice(0,200).replace(/\s+\S*$/,'').replace(/[,;:]$/,'')+'…' : text;
export const privatePath = (pathname:string) => /^\/(admin|api|checkout|orders|commerce-private|commerce-remote)(\/|$)/.test(pathname);
export const legacyDuplicate = (pathname:string) => /^\/(new|para1html|page\d+\.html)$/.test(pathname);
export function stagingOrigin(origin:string) { return new URL(origin).hostname !== 'ladyzenko.ru'; }
export function noindex(origin:string, pathname:string, host='') {
  return stagingOrigin(origin) || host.split(':')[0]==='new.ladyzenko.ru' || privatePath(pathname) || legacyDuplicate(pathname);
}
export function pageSeo(slug:string, changes?:{title:string;description:string;updated:string;firstPublished?:string}|null, originalTitle='', html=''): PageSeo {
  const base:PageSeo|undefined=seoPages()[slug] || (/^tpost-cms[a-f0-9]{14}-[a-z0-9-]{1,70}$/.test(slug) ? {
    path:'/tpost/'+slug.slice(6),headline:'',title:'',description:'',article:true,published:changes?.firstPublished,
  } : undefined);
  if(!base)throw new Error('SEO page not found');
  const headline=base.article ? textOnly(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||base.headline) : base.headline;
  const title=changes?.title && ![originalTitle,base.title].includes(changes.title) ? changes.title : (base.article && headline!==base.headline ? headline+' | Людмила Ладыженко' : base.title);
  const body=base.article ? html.match(/<div\b[^>]*itemprop="articleBody"[^>]*>([\s\S]*?)<\/div>/i)?.[1] : '';
  return {...base,headline,title,description:changes?.description || (body?excerpt(textOnly(body)):base.description),modified:changes?.updated || base.modified};
}
export function productSeo(p:Product):PageSeo {
  return {path:'/recordings/'+p.id,headline:p.title,title:p.title+' | Людмила Ладыженко',description:excerpt(p.description),image:p.image,modified:p.modified};
}
export function graph(seo:PageSeo, origin:string, product?:Product, buyable=false) {
  const url=origin+seo.path;
  const person=origin+'/obo_mne#person';
  const image=new URL(seo.image||'/stuff/block-3.jpg',origin).href;
  const nodes:Record<string,unknown>[]=[
    {'@type':'Person','@id':person,name:authorName,url:origin+'/obo_mne',jobTitle:'Психолог',description:'Частная практика с 1996 года.',sameAs:['https://t.me/psy_ladyzenko','https://vk.com/mamotime']},
    {'@type':'WebSite','@id':origin+'/#website',url:origin+'/',name:'Людмила Ладыженко',inLanguage:'ru-RU',publisher:{'@id':person}},
    {'@type':'WebPage','@id':url+'#webpage',url,name:seo.headline,description:seo.description,inLanguage:'ru-RU',isPartOf:{'@id':origin+'/#website'},about:{'@id':person},primaryImageOfPage:{'@type':'ImageObject',url:image},...(product&&seo.modified?{dateModified:seo.modified}:{})},
  ];
  if(seo.article)nodes.push({'@type':'BlogPosting','@id':url+'#article',mainEntityOfPage:{'@id':url+'#webpage'},headline:seo.headline,description:seo.description,image:[image],author:{'@id':person},publisher:{'@id':person},inLanguage:'ru-RU',...(seo.published?{datePublished:seo.published}:{}),...(seo.modified?{dateModified:seo.modified}:{})});
  if(product)nodes.push({'@type':'Product','@id':url+'#product',name:product.title,description:product.description,image:[image],url,...(buyable?{offers:{'@type':'Offer',url,price:(product.amount/100).toFixed(2),priceCurrency:'RUB',availability:'https://schema.org/InStock'}}:{})});
  return {'@context':'https://schema.org','@graph':nodes};
}
export const jsonLd = (value:unknown) => JSON.stringify(value).replace(/</g,'\\u003c');
