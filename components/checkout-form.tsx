'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { Product } from '@/lib/products';

export function CheckoutForm({ product, enabled, test }: {product: Product; enabled: boolean; test: boolean}) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState('');
  useEffect(()=>{ try{setOrderId(sessionStorage.getItem('purchase:' + product.id) || '');}catch{/* Storage may be blocked by browser privacy settings. */} },[product.id]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const id = orderId || crypto.randomUUID().replaceAll('-', ''); setOrderId(id);
      try{sessionStorage.setItem('purchase:' + product.id, id);}catch{/* The current page can still complete a purchase. */}
      // Recover an existing attempt using its scoped HttpOnly ownership cookie.
      if(orderId) {
        const existing=await fetch('/api/commerce/orders/'+orderId,{cache:'no-store'});
        if(existing.ok) {
          const previous=await existing.json();
          if(previous.status==='pending') { window.location.assign('/orders/'+orderId);return; }
          if(previous.status==='succeeded') { window.location.assign('/orders/'+orderId);return; }
          setOrderId('');try{sessionStorage.removeItem('purchase:'+product.id);}catch{}
          throw new Error('Предыдущая попытка завершена. Нажмите «Перейти к оплате» ещё раз, чтобы создать новый заказ.');
        }
        setOrderId('');try{sessionStorage.removeItem('purchase:'+product.id);}catch{}
        throw new Error('Предыдущая попытка недоступна в этом браузере. Нажмите «Перейти к оплате» ещё раз, чтобы начать заново.');
      }
      const response = await fetch('/api/commerce/checkout', { method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ requestId: id, product: product.id, email: form.get('email'), accepted: form.get('accepted') === 'on', privacyAccepted: form.get('privacyAccepted') === 'on', scheduled: form.get('scheduled') === 'on' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(result.status === 'succeeded' ? '/orders/' + result.id : result.confirmation || '/orders/' + result.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось открыть оплату.'); setBusy(false); }
  }
  if(!enabled)return <div className="commerce-form"><p className="commerce-notice" role="status">{product.kind==='lecture'?'Эта запись пока не продаётся. Покупка откроется после подключения полного видео.':'Приём оплаты временно недоступен. Согласуйте встречу с Людмилой.'}</p><Link className="commerce-button" href="/lectures">Выбрать доступную запись</Link><a href="https://t.me/psy_ladyzenko">Связаться с Людмилой</a></div>;
  return <form className="commerce-form" onSubmit={submit}>
    {test && enabled ? <p role="status">Тестовый режим. Деньги не списываются, доступ к настоящим записям не выдаётся.</p> : null}
    <label>Электронная почта<input type="email" name="email" autoComplete="email" required maxLength={254} disabled={!enabled || busy} /></label>
    <p>На этот адрес придёт подтверждение и личная ссылка на заказ. Не указывайте в форме сведения о здоровье или содержание вашего запроса.</p>
    {product.kind === 'consultation' ? <label className="commerce-check"><input type="checkbox" name="scheduled" required disabled={!enabled || busy} />Я согласовал(а) с Людмилой дату, время и формат встречи.</label> : null}
    <label className="commerce-check"><input type="checkbox" name="accepted" required disabled={!enabled || busy} /><span>Принимаю <Link href="/offer" target="_blank">условия покупки</Link>.</span></label>
    <label className="commerce-check"><input type="checkbox" name="privacyAccepted" required disabled={!enabled || busy} /><span>Даю <Link href="/consent" target="_blank">согласие на обработку данных для оформления заказа</Link>. <Link href="/privacy" target="_blank">Политика обработки данных</Link>.</span></label>
    {error ? <p className="commerce-error" role="alert">{error}</p> : null}
    <button className="commerce-button" type="submit" disabled={!enabled || busy}>{busy ? 'Открываем ЮKassa…' : 'Перейти к оплате'}</button>
    {orderId && error ? <Link href={'/orders/' + orderId}>Проверить созданный заказ</Link> : null}
    <a href="https://t.me/psy_ladyzenko">Связаться с Людмилой</a>
  </form>;
}
