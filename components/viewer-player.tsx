'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
class PlayerError extends Error {constructor(message:string,public status:number){super(message);}}
export function ViewerPlayer({id,viewer}:{id:string;viewer?:{verified:boolean;email:string}}){
  const [verified,setVerified]=useState(viewer?.verified||false);const [sent,setSent]=useState(false);
  const [code,setCode]=useState('');const [play,setPlay]=useState('');const [email,setEmail]=useState(viewer?.email||'');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [takeover,setTakeover]=useState(false);
  const [phase,setPhase]=useState(0);const [fullscreen,setFullscreen]=useState(false);
  const video=useRef<HTMLVideoElement>(null);const container=useRef<HTMLDivElement>(null);
  const base='/api/commerce/orders/'+id;
  async function api(action:string,data:unknown={}){
    const response=await fetch(base+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store'});
    const value=await response.json();if(!response.ok)throw new PlayerError(value.error||'Не удалось выполнить действие.',response.status);return value;
  }
  function pause(){video.current?.pause();video.current?.removeAttribute('src');video.current?.load();}
  function fail(e:unknown){setError(e instanceof Error?e.message:'Не удалось выполнить действие.');if(e instanceof PlayerError){if(e.status===401)setVerified(false);setTakeover(e.status===409);}}
  useEffect(()=>{setFullscreen(Boolean(document.fullscreenEnabled));},[]);
  useEffect(()=>{
    if(!play)return;
    const heartbeat=setInterval(()=>{void api('watch',{action:'heartbeat',play}).catch(e=>{pause();setPlay('');fail(e);});},15000);
    const move=setInterval(()=>setPhase(p=>(p+1)%6),7000);
    const release=()=>{void fetch(base+'/watch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop',play}),keepalive:true}).catch(()=>{});};
    window.addEventListener('pagehide',release);
    return()=>{clearInterval(heartbeat);clearInterval(move);window.removeEventListener('pagehide',release);release();};
  // A lease belongs to this mounted player, not to every tab sharing its cookie.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[play,id]);
  async function send(){setBusy(true);setError('');try{await api('login-code');setSent(true);}catch(e){fail(e);}finally{setBusy(false);}}
  async function open(replace=false){setBusy(true);setError('');try{const value=await api('watch',{takeover:replace});setPlay(value.play);setEmail(value.email);setTakeover(false);}catch(e){fail(e);}finally{setBusy(false);}}
  async function verify(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('verify-code',{code});setVerified(true);setCode('');setSent(false);await open();}catch(e){fail(e);}finally{setBusy(false);}}
  return <section className="viewer-access" aria-label="Просмотр оплаченной лекции">
    {!verified?<><h2>Подтвердите почту покупки</h2><p>Код придёт на {viewer?.email||'почту заказа'}. Личная ссылка без кода не открывает видео. Вход на другом устройстве завершает предыдущий сеанс.</p>
      <button type="button" className="commerce-button" onClick={()=>void send()} disabled={busy}>{sent?'Отправить код ещё раз':'Получить код на почту'}</button>
      {sent?<form className="commerce-form" onSubmit={verify}><p role="status">Код отправлен. Он действует 10 минут. Проверьте также папку «Спам».</p><label>Код из письма<input className="viewer-code" name="code" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" minLength={8} maxLength={8} required disabled={busy}/></label><button className="commerce-button" disabled={busy}>Подтвердить и открыть видео</button></form>:null}
    </>:<><p>Просмотр для {email}. Доступен один активный сеанс.</p>
      {!play?<button type="button" className="commerce-button" disabled={busy} onClick={()=>void open(takeover)}>{takeover?'Завершить другой просмотр и открыть здесь':'Начать просмотр'}</button>:<>
        <div className="viewer-video" ref={container} onContextMenu={e=>e.preventDefault()}>
          <video ref={video} controls controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture disableRemotePlayback playsInline autoPlay src={base+'/media?play='+play} onError={()=>setError('Видео не загрузилось. Закройте просмотр и откройте его ещё раз. Если ошибка повторится, обратитесь в поддержку.')} />
          <span className="viewer-watermark" aria-hidden="true" style={{left:phase%2?'auto':'12px',right:phase%2?'12px':'auto',top:[12,35,60][Math.floor(phase/2)]+'%'}}>{email} · {id.slice(0,8)}</span>
        </div>
        <div className="viewer-actions">{fullscreen?<button type="button" onClick={()=>{void container.current?.requestFullscreen().catch(()=>setError('Браузер не открыл полноэкранный режим.'));}}>На весь экран</button>:null}<button type="button" onClick={()=>{pause();setPlay('');}}>Закрыть просмотр</button></div>
      </>}
      <button type="button" disabled={busy} onClick={async()=>{pause();setPlay('');try{await api('logout');setVerified(false);setSent(false);}catch(e){fail(e);}}}>Выйти из просмотра</button>
    </>}
    {error?<p className="commerce-error" role="alert">{error}</p>:null}
    <p className="viewer-hint">Запись предоставляется для личного просмотра. Не передавайте коды и доступ другим людям.</p>
  </section>;
}
