import { authorName, graph, jsonLd, legacyDuplicate, pageSeo, stagingOrigin, type PageSeo } from './seo.ts';

const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const date=(s:string)=>new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'});

export function applyMirrorSeo(html:string, slug:string, originalTitle:string, origin:string, changes:{title:string;description:string;updated:string}|null, preview=false) {
  const seo=pageSeo(slug,changes,originalTitle,html);
  const canonical=origin+(slug==='new'?'/':seo.path);
  // Replace inherited Tilda metadata rather than publishing contradictory entities.
  html=html.replace(/<meta\b[^>]*\bitemprop="[^"]*"[^>]*>/gi,'')
    .replace(/\s+(?:itemscope(?:="[^"]*")?|itemtype="[^"]*"|itemprop="[^"]*"|itemid="[^"]*")/gi,'')
    .replace(/<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<meta\b[^>]*(?:name="(?:robots|googlebot|description)"|property="(?:og:title|og:description|og:url|og:type|og:image)")[^>]*>/gi,'')
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/gi,'')
    .replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+escape(seo.title)+'</title>');
  html=html.replace(/<html\b([^>]*)>/i,(_m,attrs:string)=>'<html'+attrs.replace(/\s+lang="[^"]*"/i,'')+' lang="ru">');
  // The original trackers ran twice on the homepage and were absent elsewhere.
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/mc\.yandex\.(?:ru|com)|\bym\(\s*\d/.test(tag)?'':tag)
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,tag=>/mc\.yandex\.(?:ru|com)/.test(tag)?'':tag);
  const robots=stagingOrigin(origin)||legacyDuplicate(seo.path)||preview?'noindex, follow':'index, follow';
  const image=new URL(seo.image||'/stuff/block-3.jpg',origin).href;
  html=html.replace('</head>',()=>`<meta name="description" content="${escape(seo.description)}"><meta name="robots" content="${robots}"><meta name="referrer" content="strict-origin-when-cross-origin"><link rel="canonical" href="${escape(canonical)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:title" content="${escape(seo.title)}"><meta property="og:description" content="${escape(seo.description)}"><meta property="og:type" content="${seo.article?'article':'website'}"><meta property="og:image" content="${escape(image)}"><script type="application/ld+json">${jsonLd(graph(seo,origin))}</script><link rel="stylesheet" href="/site-seo.css"><script defer src="/site-analytics.js"></script></head>`);
  if(seo.article) {
    const updated=changes?.updated && changes.updated!==seo.published ? ` · Обновлено <time datetime="${escape(changes.updated)}">${date(changes.updated)}</time>`:'';
    const published=seo.published?` · <time datetime="${escape(seo.published)}">${date(seo.published)}</time>`:'';
    html=html.replace(/<\/h1>/i,()=>`</h1><p class="seo-byline t-descr">Автор: <a rel="author" href="/obo_mne">${authorName}</a>${published}${updated}</p>`);
  } else if(!/<h1\b/i.test(html)) {
    // Give existing visual headings semantics without rebuilding the exported layout.
    let promoted=false;
    html=html.replace(/<(div|h2|p|strong)\b([^>]*)>([^<>]*(?:<!--[^>]*-->[^<>]*)*)<\/\1>/gi,(tag,name:string,attrs:string,body:string)=>{
      if(promoted || body.replace(/<!--[\s\S]*?-->/g,'').trim()!==seo.headline)return tag;
      promoted=true;return '<h1'+attrs.replace(/\s+class="[^"]*"/i,'')+' class="seo-promoted-title '+(attrs.match(/class="([^"]*)"/)?.[1]||'')+'">'+body+'</h1>';
    });
    if(!promoted)html=html.replace(/(<body\b[^>]*>)/i,(_m,tag:string)=>tag+'<header class="seo-page-heading"><h1>'+escape(seo.headline)+'</h1></header>');
  }
  html=html.replace('</body>','<button type="button" class="site-cookie-settings t-descr" data-analytics-settings>Настройки аналитики</button></body>');
  return html;
}
