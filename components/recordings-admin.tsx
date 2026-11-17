'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { recordingImports } from '@/lib/recording-imports';
type Recording=ReturnType<typeof recordingImports>[number];
const statuses={queued:'Ожидает загрузки',processing:'Скачивание и проверка видео',ready:'Запись подключена',error:'Не удалось подключить запись'};
function Row({item,onSaved}:{item:Recording;onSaved:(rows:Recording[])=>void}) {
  const [url,setUrl]=useState(item.job?.url||'');const [selling,setSelling]=useState(item.selling);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  async function save(e:FormEvent) {
    e.preventDefault();setBusy(true);setMessage('');
    try {
      const response=await fetch('/api/admin/recordings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:item.id,url,selling,version:item.job?.version||''})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Не удалось сохранить.');
      onSaved(data);setMessage(url.trim() && (url.trim()!==item.job?.url || item.job?.status==='error')?'Ссылка сохранена. Загрузка начнётся в течение минуты.':'Настройки сохранены.');
    }catch(e){setMessage(e instanceof Error?e.message:'Не удалось сохранить.');}finally{setBusy(false);}
  }
  return <form className="recording-admin-row" onSubmit={save}>
    <h3>{item.title}</h3>
    <p>{item.available?'Покупка включена':item.connected?'Покупка приостановлена':'Для покупки нужна полная запись'} · {(item.amount/100).toLocaleString('ru-RU')} ₽ · доступ 30 дней</p>
    <label>Ссылка на скачивание полной записи<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" maxLength={4096} disabled={busy} /></label>
    <label className="commerce-check"><input type="checkbox" checked={selling} onChange={e=>setSelling(e.target.checked)} disabled={busy} /><span>Продавать лекцию после проверки записи</span></label>
    <p role="status">{item.job?statuses[item.job.status]:item.connected?'Запись уже подключена':'Ссылка ещё не указана'}{item.job?.error?' — '+item.job.error:''}</p>
    <button className="commerce-button" disabled={busy}>{busy?'Сохраняем…':item.job?.status==='error'?'Сохранить и повторить загрузку':'Сохранить запись'}</button>
    {message?<p role="status">{message}</p>:null}
    <p><a href={'/checkout/'+item.id} target="_blank" rel="noreferrer">Проверить страницу покупки</a></p>
  </form>;
}
export function RecordingsAdmin() {
  const [rows,setRows]=useState<Recording[]>([]);const [error,setError]=useState('');
  async function refresh(){try{const r=await fetch('/api/admin/recordings',{cache:'no-store'});if(!r.ok)throw new Error('Не удалось загрузить записи. Обновите страницу или войдите снова.');setRows(await r.json());setError('');}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить записи.');}}
  useEffect(()=>{void refresh();const timer=setInterval(()=>void refresh(),15000);return()=>clearInterval(timer);},[]);
  return <section className="admin-section" id="recordings"><h2>Записи и продажи лекций</h2>
    <p>Укажите прямую HTTPS ссылку на MP4, публичную ссылку Google Drive или Яндекс Диска на один видеофайл. Ссылка должна скачиваться без входа в аккаунт. Нужны видео H.264 и звук AAC.</p>
    <p>Сайт скачает запись на закрытый видеосервер, проверит воспроизведение и автоматически включит покупку. Ссылка на исходный файл покупателям не показывается. Обновление статусов происходит автоматически.</p>
    {error?<p role="alert">{error}</p>:null}{rows.map(item=><Row key={item.id} item={item} onSaved={setRows}/>)}
  </section>;
}
