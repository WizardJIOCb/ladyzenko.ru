'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { recordingImports } from '@/lib/recording-imports';
import {RecordingDetailsEditor} from './recording-details-editor';
type Recording=ReturnType<typeof recordingImports>[number];
const statuses={queued:'Ожидает загрузки',processing:'Скачивание и проверка видео',ready:'Запись подключена',error:'Не удалось подключить запись'};
function duration(seconds:number|null,fallback:string){if(!seconds)return fallback||'Длительность уточняется';const n=Math.round(seconds);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map((x,i)=>i?String(x).padStart(2,'0'):String(x)).join(':');}
function size(bytes:number|null){return bytes?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(bytes/(bytes>=1e9?1e9:1e6))+(bytes>=1e9?' ГБ':' МБ'):'';}
function Row({item,onSaved,playing,onPlay}:{item:Recording;onSaved:(rows:Recording[])=>void;playing:boolean;onPlay:()=>void}) {
  const [url,setUrl]=useState(item.job?.url||'');const [selling,setSelling]=useState(item.selling);const [version,setVersion]=useState(item.job?.version||'');
  const [dirty,setDirty]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [mediaError,setMediaError]=useState('');
  useEffect(()=>{if(!dirty){setUrl(item.job?.url||'');setSelling(item.selling);setVersion(item.job?.version||'');}},[item.job?.url,item.job?.version,item.selling,dirty]);
  async function save(e:FormEvent) {
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/admin/recordings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:item.id,url,selling,version})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось сохранить.');
      onSaved(data);setDirty(false);setMessage(url.trim() && (url.trim()!==item.job?.url || item.job?.status==='error')?'Ссылка сохранена. Загрузка начнётся в течение минуты.':'Настройки сохранены.');
    }catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить.');}finally{setBusy(false);}
  }
  const media=item.media;
  return <article className="recording-admin-row" id={'recording-'+item.id}>
    <div className="recording-card">
      <div className="recording-visual">{media?playing?<><video controls autoPlay playsInline preload="metadata" src={media.previewUrl} poster={media.posterUrl||undefined} aria-label={'Предпросмотр: '+item.title} onError={()=>setMediaError('Видео не загрузилось. Обновите страницу или проверьте запись.')} /><button type="button" className="admin-link-button" onClick={onPlay}>Закрыть предпросмотр</button></>:<button type="button" className="recording-poster" onClick={()=>{setMediaError('');onPlay();}} aria-label={'Посмотреть видео: '+item.title}>{media.posterUrl?<img src={media.posterUrl} alt={'Кадр из видео «'+item.title+'»'} loading="lazy"/>:<span className="recording-empty">Кадр пока не подготовлен</span>}<span className="recording-play">Смотреть видео</span></button>:<div className="recording-empty">Видео не подключено</div>}</div>
      <div className="recording-description"><div className="recording-badges"><span className={item.connected?'recording-badge is-ready':'recording-badge'}>{item.connected?'Видео подключено':'Нужна запись'}</span>{item.connected?<span className="recording-badge">{item.available?'Покупка включена':!item.selling?'Продажи приостановлены':'Оплата сейчас недоступна'}</span>:null}</div>
        <h3>{item.title}</h3><p className="recording-facts">{duration(media?.durationSeconds??null,item.duration)}{media?.sizeBytes?' · '+size(media.sizeBytes):''}{media?.width&&media?.height?' · '+media.width+' × '+media.height:''}</p>
        <p>{(item.amount/100).toLocaleString('ru-RU')} ₽ · доступ 30 дней</p>
        {media?<><p className="recording-file"><span>Подключённый файл</span><code>{media.fileName}</code></p><p className="admin-hint">Закрытый сервер. Это видео открывается покупателю после оплаты и подтверждения почты.</p></>:<p className="admin-hint">Для этой карточки видео ещё не сопоставлено. Другие подключённые лекции показаны в разделе «Подключены».</p>}
        <a href={'/checkout/'+item.id} target="_blank" rel="noreferrer">{item.available?'Открыть страницу покупки':'Проверить карточку покупки'}</a>
      </div>
    </div>
    {mediaError?<p role="alert" className="commerce-error">{mediaError}</p>:null}
    {item.job&&item.job.status!=='ready'?<p role="status">{statuses[item.job.status]}{item.connected?' · Сейчас используется прежняя подключённая запись.':''}{item.job.error?' — '+item.job.error:''}</p>:null}
    <RecordingDetailsEditor item={item} onSaved={onSaved}/>
    <details className="recording-settings"><summary>{item.connected?'Заменить видео или изменить продажи':'Подключить полную запись'}</summary><form onSubmit={save}>
      {item.connected?<p className="admin-hint">Видео уже находится на сервере. Новая ссылка нужна только для замены записи.</p>:null}
      <label>{item.connected?'Ссылка для замены видео':'Ссылка на скачивание полной записи'}<input type="url" value={url} onChange={e=>{setUrl(e.target.value);setDirty(true);}} placeholder="https://…" maxLength={4096} disabled={busy}/></label>
      <label className="commerce-check"><input type="checkbox" checked={selling} onChange={e=>{setSelling(e.target.checked);setDirty(true);}} disabled={busy}/><span>Продавать лекцию после проверки записи</span></label>
      <button className="commerce-button" disabled={busy}>{busy?'Сохраняем…':item.job?.status==='error'?'Сохранить и повторить загрузку':'Сохранить настройки'}</button>
      {message?<p role="status">{message}</p>:null}
    </form></details>
  </article>;
}
export function RecordingsAdmin() {
  const [rows,setRows]=useState<Recording[]>([]);const [error,setError]=useState('');const [loaded,setLoaded]=useState(false);
  const [filter,setFilter]=useState('connected');const [search,setSearch]=useState('');const [playing,setPlaying]=useState('');
  async function refresh(){try{const r=await fetch('/api/admin/recordings',{cache:'no-store'});if(!r.ok)throw new Error('Не удалось загрузить записи. Обновите страницу или войдите снова.');setRows(await r.json());setLoaded(true);setError('');}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить записи.');}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[]);
  const connected=rows.filter(r=>r.connected).length;
  const visible=rows.filter(r=>(filter==='all'||(filter==='connected'?r.connected:!r.connected))&&(r.title+' '+(r.media?.fileName||'')).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>Number(b.connected)-Number(a.connected));
  return <section className="admin-section recording-library" id="recordings"><h2>Записи и продажи лекций</h2>
    <p>Здесь видно, какое видео подключено к каждой лекции. Нажмите на кадр, чтобы проверить полную запись. Предпросмотр доступен только администратору.</p>
    {loaded?<p className="recording-overview"><strong>{connected} с видео</strong><span>{rows.filter(r=>r.available).length} доступны для покупки</span><span>{rows.length-connected} без записи</span></p>:<p role="status">Загружаем записи…</p>}
    <div className="recording-toolbar"><div className="recording-filters" aria-label="Наличие видео">{[['connected','Подключены',connected],['missing','Без видео',rows.length-connected],['all','Все',rows.length]].map(([value,label,count])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(String(value))}>{label} ({count})</button>)}</div><label>Найти лекцию или файл<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Название лекции или файла"/></label></div>
    {error?<p role="alert" className="commerce-error">{error}</p>:null}{visible.map(item=><Row key={item.id} item={item} onSaved={setRows} playing={playing===item.id} onPlay={()=>setPlaying(current=>current===item.id?'':item.id)}/>)}
    {loaded&&!visible.length?<p role="status">В этом списке ничего не найдено.</p>:null}
    <details className="recording-import-help"><summary>Как добавить или заменить видео</summary><p>Укажите в настройках лекции прямую HTTPS ссылку на MP4 либо публичную ссылку Google Drive или Яндекс Диска на один файл. Нужны видео H.264 и звук AAC. Сайт скачает файл в закрытое хранилище и проверит его до включения покупки. Для уже подключённого видео повторно указывать ссылку не нужно.</p></details>
  </section>;
}
