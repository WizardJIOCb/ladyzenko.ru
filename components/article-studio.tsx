'use client';

import { useEffect,useState } from 'react';
import dynamic from 'next/dynamic';
import type { articleEditor, articleList } from '@/lib/mirror';

const RichEditor=dynamic(()=>import('./article-rich-editor').then(m=>m.ArticleRichEditor),{ssr:false,loading:()=> <p>Загрузка редактора…</p>});
type Article=ReturnType<typeof articleEditor>;
type Library=ReturnType<typeof articleList>;
const empty:Article={slug:'',path:'',revision:'',headline:'',title:'',description:'',sections:[''],draft:false,live:false,canRestore:false};
const date=(value:string)=>new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
async function api(query='',body?:unknown){
  const res=await fetch('/api/admin/articles'+query,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'Не удалось открыть статью.');
  return data;
}
export function ArticleStudio({initial,opened=null}:{initial:Library;opened?:Article|null}) {
  const [library,setLibrary]=useState(initial);
  const [article,setArticle]=useState<Article|null>(opened);
  const [edits,setEdits]=useState<Record<number,string>>({});
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const [search,setSearch]=useState('');
  const [filter,setFilter]=useState('all');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!dirty)return;
    const guard=(e:BeforeUnloadEvent)=>e.preventDefault();
    window.addEventListener('beforeunload',guard);
    return ()=>window.removeEventListener('beforeunload',guard);
  },[dirty]);
  function show(next:Article|null){
    setArticle(next);setEdits({});setDirty(false);setMessage('');setError('');
    window.scrollTo({top:0});
  }
  async function open(slug:string){
    setBusy(true);setError('');
    try{show(await api('?slug='+encodeURIComponent(slug)));}catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  function change(key:'headline'|'description'|'title',value:string){
    setArticle(a=>a && {...a,[key]:value});setDirty(true);setMessage('');
  }
  async function save(operation:'draft'|'publish'|'discard'|'restore'){
    if(!article)return;
    if(operation==='restore'&&!window.confirm('Вернуть предыдущую опубликованную версию? Текущий черновик будет удалён.'))return;
    if(operation==='discard'&&!window.confirm('Удалить сохранённый черновик и текущие правки?'))return;
    setBusy(true);setError('');setMessage('');
    try{
      const next=await api('',{slug:article.slug,revision:article.revision,headline:article.headline,title:article.title,description:article.description,edits,operation});
      setArticle(next);setEdits({});setDirty(false);
      setMessage(operation==='publish'?'Статья опубликована.':operation==='restore'?'Предыдущая версия восстановлена.':operation==='discard'?'Черновик удалён.':'Черновик сохранён.');
      setLibrary(await api());
    }catch(err){setError((err as Error).message);}finally{setBusy(false);}
  }
  const feedback=<>{error&&<p className="studio-error" role="alert">{error}</p>}{message&&<p className="studio-notice" role="status">{message}</p>}</>;
  if(!article){
    const visible=library.filter(p=>(filter!=='draft'||p.draft)&&(p.title+' '+p.path).toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
    return <section className="article-studio"><a href="/admin">← Управление сайтом</a>
      <header className="studio-head"><h1>Статьи</h1><button className="studio-primary" disabled={busy} onClick={()=>show({...empty})}>+ Новая статья</button></header>
      <div className="library-tools"><input type="search" aria-label="Поиск статей" placeholder="Найти статью по названию" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select aria-label="Статус статьи" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Все статьи ({library.length})</option><option value="draft">С черновиками ({library.filter(p=>p.draft).length})</option></select></div>
      {feedback}<ul className="article-library">{visible.map(p=><li key={p.slug}><button disabled={busy} onClick={()=>open(p.slug)}>
        <span><strong>{p.title}</strong><small>{p.published?date(p.published):'Новая статья'}{p.draft?' · Черновик':''}</small></span><span aria-hidden="true">↗</span></button></li>)}</ul>
      {!visible.length&&<p>По вашему запросу статей нет.</p>}</section>;
  }
  return <section className="article-studio">
    <button className="studio-back" disabled={busy} onClick={()=>{if(!dirty||confirm('Выйти без сохранения правок?'))show(null);}}>← Все статьи</button>
    <header className="studio-head"><h1>{article.slug?'Редактирование статьи':'Новая статья'}</h1></header>
    <label className="studio-field">Заголовок статьи<input className="studio-headline" disabled={busy} value={article.headline} maxLength={300} placeholder="Название публикации" onChange={e=>change('headline',e.target.value)}/></label>
    {article.sections.map((section,i)=><div key={(article.slug||'new')+article.revision+i}>
      <h2 className="studio-label">{article.sections.length===1?'Текст статьи':'Текстовый блок '+(i+1)}</h2>
      <RichEditor initial={section} label={'Текст статьи '+(i+1)} disabled={busy} onUpload={setBusy} onError={setError}
        onEdit={value=>{setEdits(v=>{const next={...v};if(value===null)delete next[i];else next[i]=value;return next;});setDirty(true);setMessage('');}}/></div>)}
    <details className="studio-meta"><summary>Заголовок и описание для поиска</summary>
      <label className="studio-field">SEO-заголовок<input disabled={busy} value={article.title} maxLength={500} placeholder="По заголовку статьи" onChange={e=>change('title',e.target.value)}/></label>
      <label className="studio-field">Описание<textarea disabled={busy} rows={3} value={article.description} maxLength={2000} placeholder="По тексту статьи" onChange={e=>change('description',e.target.value)}/></label></details>
    <div className="studio-save">{feedback}<div className="studio-actions">
      <button className="studio-primary" disabled={busy||!article.headline.trim()} onClick={()=>save('draft')}>Сохранить черновик</button>
      {article.draft&&<a href={article.path+'?preview=1'} target="_blank" rel="noreferrer">Предпросмотр черновика ↗</a>}
      <button disabled={busy||!article.headline.trim()} onClick={()=>save('publish')}>Опубликовать</button>
      {article.live&&<a href={article.path} target="_blank" rel="noreferrer">На сайте ↗</a>}</div>
      <small>{busy?'Подождите…':dirty?'Есть несохранённые изменения':article.draft?'Сохранённый черновик':article.live?'Опубликованная версия':'Черновик'}</small>
      {article.canRestore&&<button className="studio-back discard" disabled={busy} onClick={()=>save('restore')}>Вернуть предыдущую версию</button>}
      {article.draft&&<button className="studio-back discard" disabled={busy} onClick={()=>save('discard')}>Удалить черновик</button>}</div>
  </section>;
}

