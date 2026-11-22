'use client';
import {useEffect,useState,type FormEvent} from 'react';
import type {recordingImports} from '@/lib/recording-imports';
type Recording=ReturnType<typeof recordingImports>[number];
export function RecordingDetailsEditor({item,onSaved}:{item:Recording;onSaved:(rows:Recording[])=>void}){
  const [title,setTitle]=useState(item.title),[description,setDescription]=useState(item.description),[price,setPrice]=useState(String(item.amount/100)),[image,setImage]=useState(item.image),[version,setVersion]=useState(item.detailsVersion);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
  useEffect(()=>{if(!dirty){setTitle(item.title);setDescription(item.description);setPrice(String(item.amount/100));setImage(item.image);setVersion(item.detailsVersion);}},[item.title,item.description,item.amount,item.image,item.detailsVersion,dirty]);
  async function upload(file:File|undefined){if(!file)return;setBusy(true);setError('');setMessage('');try{
    if(file.size>8*1024*1024)throw new Error('Изображение больше 8 МБ.');
    const r=await fetch('/api/admin/content-image',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});const value=await r.json();if(!r.ok)throw new Error(value.error||'Не удалось загрузить изображение.');
    setImage(value.url);setDirty(true);setMessage('Обложка загружена. Сохраните карточку, чтобы показать её на сайте.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить изображение.');}finally{setBusy(false);}}
  async function save(e:FormEvent){e.preventDefault();setError('');setMessage('');if(!/^\d{1,7}([.,]\d{1,2})?$/.test(price.trim())){setError('Укажите цену в рублях, например 1000 или 1000,50.');return;}
    setBusy(true);try{const r=await fetch('/api/admin/recording-details',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product:item.id,version,title,description,amount:Math.round(Number(price.replace(',','.'))*100),image})});const value=await r.json();if(!r.ok)throw new Error(value.error||'Не удалось сохранить карточку.');onSaved(value);setDirty(false);setMessage('Карточка сохранена. Название, описание, цена и обложка обновлены на сайте.');}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить.');}finally{setBusy(false);}}
  return <details className="recording-settings recording-details-editor"><summary>Название, описание, цена и обложка</summary><form onSubmit={save}>
    <p className="admin-hint">Изменения появятся в каталоге и новых покупках после сохранения. Уже оформленные заказы сохраняют свою цену и название.</p>
    <label>Название лекции<input value={title} required maxLength={300} disabled={busy} onChange={e=>{setTitle(e.target.value);setDirty(true);}}/></label>
    <label>Описание лекции<textarea value={description} required maxLength={12000} rows={5} disabled={busy} onChange={e=>{setDescription(e.target.value);setDirty(true);}}/></label>
    <label>Цена в рублях<input type="text" inputMode="decimal" value={price} required maxLength={10} disabled={busy} onChange={e=>{setPrice(e.target.value);setDirty(true);}}/></label>
    <div className="recording-cover-editor">{image||item.media?.posterUrl?<img src={image||item.media!.posterUrl!} alt={image?'Обложка лекции для каталога':'Кадр из видео для каталога'}/>:<p className="admin-hint">После подключения видео здесь появится кадр.</p>}<div><label>Загрузить обложку<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={e=>void upload(e.target.files?.[0])}/></label><p className="admin-hint">{image?'В каталоге будет загруженная обложка.':'В каталоге используется кадр из видео.'} PNG, JPEG, WebP или GIF до 8 МБ.</p>{image?<button type="button" className="admin-link-button" disabled={busy} onClick={()=>{setImage('');setDirty(true);}}>Использовать кадр из видео</button>:null}</div></div>
    <div className="recording-edit-actions"><button className="commerce-button" disabled={busy}>{busy?'Сохраняем…':'Сохранить карточку'}</button><button type="button" className="admin-link-button" disabled={busy||!dirty} onClick={()=>{setDirty(false);setMessage('');setError('');}}>Отменить изменения</button></div>
    {dirty?<p className="admin-hint">Есть несохранённые изменения.</p>:null}{message?<p role="status">{message}</p>:null}{error?<p role="alert" className="commerce-error">{error}</p>:null}
  </form></details>;
}
