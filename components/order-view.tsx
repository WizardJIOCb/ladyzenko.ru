'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatPrice } from '@/lib/products';
type View = {product:string; title:string; kind:string; amount:number; status:string; test:boolean; confirmation:string|null; expires:number|null; canWatch:boolean; mailSent:boolean};
export function OrderView({id}:{id:string}) {
  const [view,setView] = useState<View>(); const [error,setError] = useState(''); const [busy,setBusy] = useState(false);
  const refresh = useCallback(async (provider = false) => {
    setBusy(true); setError('');
    try {
      const key = new URLSearchParams(window.location.hash.slice(1)).get('key');
      if (key) {
        const access = await fetch('/api/commerce/orders/' + id + '/access', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})});
        if (!access.ok) throw new Error((await access.json()).error);
        window.history.replaceState(null,'',window.location.pathname);
      }
      const response = await fetch('/api/commerce/orders/' + id + (provider ? '/refresh' : ''), provider ? {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'} : {cache:'no-store'});
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setView(data);
      if (['succeeded','canceled','refunded'].includes(data.status) && sessionStorage.getItem('purchase:' + data.product) === id) {
        sessionStorage.removeItem('purchase:' + data.product);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось проверить заказ.'); }
    finally { setBusy(false); }
  },[id]);
  useEffect(()=>{ void refresh(true); },[refresh]);
  return <div className="commerce-form" aria-busy={busy}>
    {!view && busy ? <p role="status">Проверяем оплату…</p> : null}
    {error ? <p role="alert" className="commerce-error">{error}</p> : null}
    {view ? <><h1>{view.title}</h1><p>{formatPrice(view.amount)}</p>
      <p role="status">{view.status === 'succeeded' ? (view.test ? 'Тестовый платёж завершён. Настоящая услуга не оплачена.' : 'Оплата подтверждена.')
        : view.status === 'refunded' ? 'Деньги возвращены. Доступ закрыт.' : view.status === 'canceled' ? 'Платёж отменён.' : 'Ожидаем подтверждение оплаты от ЮKassa.'}</p>
      {view.status === 'succeeded' && !view.test && view.kind === 'consultation' ? <p>Встреча пройдёт в согласованное с Людмилой время. По вопросам встречи и возврата свяжитесь по контактам сайта, указав номер заказа.</p> : null}
      {view.status === 'succeeded' && !view.test ? <p>{view.mailSent ? 'Подтверждение отправлено на вашу почту.' : 'Письмо с подтверждением готовится к отправке. Эта страница уже показывает подтверждённый статус.'}</p> : null}
      {view.expires ? <p>Срок доступа до {new Date(view.expires*1000).toLocaleString('ru-RU', {timeZone:'Asia/Yekaterinburg'})} (Екатеринбург).</p> : null}
      {view.canWatch ? <video controls controlsList="nodownload" src={'/api/commerce/orders/' + id + '/media'} /> : null}
      {view.confirmation ? <a className="commerce-button" href={view.confirmation}>Продолжить оплату в ЮKassa</a> : null}</> : null}
    <button type="button" className="commerce-button" disabled={busy} onClick={()=>void refresh(true)}>{busy ? 'Проверяем…' : 'Проверить статус'}</button>
    <p>Номер заказа: <code>{id}</code>. Личная ссылка из письма открывает заказ — не передавайте её другим людям.</p>
  </div>;
}
