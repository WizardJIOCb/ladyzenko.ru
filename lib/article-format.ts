import sanitize from 'sanitize-html';
import { randomBytes } from 'node:crypto';
import { CommerceError } from './commerce.ts';

export const isNewArticle = (slug:string) => /^tpost-cms[a-f0-9]{14}-[a-z0-9-]{1,70}$/.test(slug);
export function newArticleSlug(title:string) {
  const letters = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const latin = 'a b v g d e yo zh z i y k l m n o p r s t u f h ts ch sh sch _ y _ e yu ya'.split(' ');
  const name = title.toLowerCase().replace(/[а-яё]/g, c=>latin[letters.indexOf(c)])
    .replace(/[^a-z0-9]+/g,'-').slice(0,70).replace(/^-+|-+$/g,'');
  return 'tpost-cms'+randomBytes(7).toString('hex')+'-'+(name||'statya');
}
export const articlePath = (slug:string) => '/tpost/'+slug.slice(6);
export const newArticleHtml = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head><body><main class="authored-article"><nav><a href="/articles">← Все статьи</a></nav><article><h1><!--cms:headline--><!--/cms:headline--></h1><div itemprop="articleBody"><section><div class="t-redactor__text"></div></section></div></article></main></body></html>`;

// Every imported article has these text containers. Photographs, embeds and other
// Tilda blocks sit alongside them and remain in their original positions.
export const textRegions = () => /(<div class="t-redactor__text">)([\s\S]*?)(<\/div>)/g;
export function editableRegions(html:string) {
  return [...html.matchAll(textRegions())].map(m=>m[2].replace(/<!--\/?cms:[\w-]+-->/g,''));
}

export function sanitizeRegions(input:unknown, originals:string[]):Record<string,string> {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new CommerceError(400,'Проверьте текст статьи.');
  const result:Record<string,string>={};
  for (const [key,value] of Object.entries(input)) {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key)>=originals.length || typeof value!=='string' || value.length>300000)
      throw new CommerceError(400,'Некорректный текстовый блок.');
    const clean=sanitize(value,{
      allowedTags:['p','br','h2','h3','strong','em','u','s','blockquote','ul','ol','li','a','img','hr'],
      allowedAttributes:{a:['href'],img:['src','alt'],ol:['start']},
      allowedSchemes:['https','http','mailto','tel'],allowProtocolRelative:false,
      exclusiveFilter:frame=>frame.tag==='img' && !/^\/(?:api\/site\/image\/[a-f0-9]{32}\.(?:png|jpg|webp|gif)|mirror-assets\/[a-zA-Z0-9._-]+)$/.test(frame.attribs.src||''),
    });
    if(clean!==originals[Number(key)]) result[key]=clean;
  }
  return result;
}

