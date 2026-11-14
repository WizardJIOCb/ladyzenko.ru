'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { adminState } from '@/lib/admin';
import { ContentAdmin } from './content-admin';
type State = ReturnType<typeof adminState>;
type Fields = State['profile'] & { productionShopId: string; adminNotes: string; legalApproved: boolean };
function fields(s: State): Fields { return { ...s.profile, productionShopId: s.productionShopId, adminNotes: s.adminNotes, legalApproved: false }; }
export function AdminPanel({ initial }: { initial: State | null }) {
  const [state, setState] = useState(initial);
  const [form, setForm] = useState<Fields | null>(initial ? fields(initial) : null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  async function request(action: string, data: unknown) {
    const response = await fetch('/api/admin/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), cache: 'no-store' });
    const body = await response.json();
    if (response.status === 401 && action !== 'login') { setState(null); setForm(null); }
    if (!response.ok) throw new Error(body.error || 'Не удалось сохранить.'); return body;
  }
  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('');
    const data = new FormData(e.currentTarget);
    try { await request('login', { password: data.get('password') }); window.location.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось войти.'); setBusy(false); }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!state || !form) return; setBusy(true); setError(''); setMessage('');
    try { const next = await request('settings', { ...form, revision: state.revision }) as State; setState(next); setForm(fields(next)); setMessage('Сохранено. Публичные документы обновлены. Настройки приёма платежей не изменены.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить.'); }
    finally { setBusy(false); }
  }
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const element = e.currentTarget; const data = new FormData(element); setError(''); setMessage('');
    if (data.get('replacement') !== data.get('repeat')) { setError('Новые пароли не совпадают.'); return; }
    setBusy(true);
    try { await request('password', { current: data.get('current'), replacement: data.get('replacement') }); element.reset(); setMessage('Пароль изменён. Остальные сеансы завершены.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось изменить пароль.'); }
    finally { setBusy(false); }
  }
  if (!state || !form) return <><a href="/">← На сайт</a><h1>Управление сайтом</h1><p>Реквизиты продавца, документы и готовность оплаты.</p>
    <form className="commerce-form admin-login" onSubmit={signIn}><label>Пароль администратора<input name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy} /></label>
      {error && <p className="commerce-error" role="alert">{error}</p>}<button className="commerce-button" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button></form></>;
  const change = (key: keyof Fields, value: string | boolean) => { setForm({ ...form, [key]: value, ...(key !== 'legalApproved' ? { legalApproved: false } : {}) }); setMessage(''); };
  const input = (key: keyof Fields, title: string, hint?: string, maxLength = 254) => <label>{title}<input value={String(form[key])} onChange={e => change(key, e.target.value)} maxLength={maxLength} disabled={busy} />{hint && <span className="admin-hint">{hint}</span>}</label>;
  return <><div className="admin-heading"><a href="/">← На сайт</a><button type="button" className="admin-link-button" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await request('logout', {}); window.location.reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выйти.'); setBusy(false); } }}>Выйти</button></div>
    <h1>Управление сайтом</h1><p><a href="#content">Страницы и контент</a> · <a href="#readiness">Оплата и документы</a></p>
    <ContentAdmin />
    <section className="admin-section" aria-labelledby="readiness"><h2 id="readiness">Что осталось до запуска</h2>
      <p className="commerce-notice">{state.payment.enabled ? (state.payment.mode === 'test' ? 'Включён тестовый режим.' : state.payment.ready ? 'Рабочая оплата включена.' : 'Оплата заблокирована проверкой готовности.') : 'Приём платежей выключен.'} Сохранение этой формы не включает оплату.</p>
      {state.gaps.length ? <><p>Недостающие сведения продавца:</p><ul>{state.gaps.map(gap => <li key={gap}><a href="#seller-fields">{gap}</a></li>)}</ul></> : <p>Реквизиты заполнены. Их достоверность проверяет владелец.</p>}
      <ul className="admin-checklist">
        <li><strong>{state.legalApproved && !state.gaps.length ? 'Готово' : 'Проверить'}: документы.</strong> Откройте <Link href="/offer" target="_blank">оферту</Link>, <Link href="/payment-info" target="_blank">оплату и возвраты</Link>, <Link href="/privacy" target="_blank">политику</Link> и <Link href="/consent" target="_blank">согласие</Link>, затем подтвердите ниже.</li>
        <li><strong>Проверить в ЮKassa: одобрение рабочего магазина.</strong> Рабочий ShopID: {state.productionShopId || 'не указан'}. Статус модерации автоматически не проверяется. <a href="https://yookassa.ru/my" target="_blank" rel="noreferrer">Открыть кабинет</a>.</li>
        <li><strong>{state.payment.mode === 'live' && state.payment.keyConfigured ? 'Настроено' : 'Не готово'}: рабочие реквизиты API.</strong> Сейчас режим {state.payment.mode === 'test' ? 'тестовый' : 'рабочий'}, ShopID {state.payment.shopId || 'не задан'}. Боевой ключ устанавливается администратором на сервере.</li>
        <li><strong>{state.payment.fiscalizationConfirmed ? 'Подтверждено владельцем' : 'Не готово'}: чеки.</strong> {state.payment.fiscalizationMethod === 'npd_manual' ? 'Продавец формирует чеки вручную в «Мой налог» и отправляет покупателю. Заказы и адреса покупателей приведены ниже.' : 'Нужно выбрать и проверить схему по фактическому статусу продавца.'} Подтверждение заказа по почте не заменяет фискальный чек.</li>
        <li><strong>{state.payment.smtpConfigured ? 'Настроено' : 'Не готово'}: отправка писем.</strong> Наличие настроек не подтверждает доставку. Перед запуском проверить реальный заказ, письмо, чек и возврат.</li>
        <li><strong>Проверить владельцу: персональные данные.</strong> Проверить сведения об операторе, уведомление Роскомнадзора, основания обработки, сроки хранения и порядок удаления. Факт подачи уведомления сайт не устанавливает.</li>
      </ul>
    </section>
    <form className="commerce-form" onSubmit={save}>
      <section className="admin-section" id="seller-fields"><h2>Реквизиты продавца</h2><p>Эти сведения публикуются на сайте сразу после сохранения. Укажите адрес, предназначенный для обращений покупателей.</p>
        <div className="admin-fields">{input('seller', 'ФИО или наименование продавца')}{input('inn', 'ИНН', '12 цифр для физического лица или ИП, 10 для организации.')}
          <label>Статус по договору ЮKassa<select value={form.sellerStatus} onChange={e => change('sellerStatus', e.target.value)} disabled={busy}><option value="">Выберите статус</option><option value="selfemployed">Самозанятый, плательщик НПД</option><option value="ip">Индивидуальный предприниматель</option><option value="company">Юридическое лицо</option></select><span className="admin-hint">ИП на НПД выбирает статус ИП. Система налогообложения уточняется при настройке чеков.</span></label>
          {form.sellerStatus === 'ip' || form.sellerStatus === 'company' ? input('registrationNumber', form.sellerStatus === 'ip' ? 'ОГРНИП' : 'ОГРН') : null}
          {input('contactEmail', 'Почта для оплаты и возвратов')}{input('contactPhone', 'Телефон для обращений')}
        </div>
        <label>Почтовый адрес продавца<textarea value={form.postalAddress} onChange={e => change('postalAddress', e.target.value)} maxLength={2000} rows={3} disabled={busy} /></label>
        <label>Основание продажи услуг и записей Людмилы<textarea value={form.sellerBasis} onChange={e => change('sellerBasis', e.target.value)} maxLength={2000} rows={3} disabled={busy} /><span className="admin-hint">Опишите, на каком основании продавец заключает договор с покупателем, принимает деньги и использует записи. Текст публикуется в оферте. При НПД отдельно проверьте допустимость этой схемы; галочка не заменяет договор и права автора.</span></label>
        <label className="commerce-check"><input type="checkbox" checked={form.sellerBasisConfirmed} onChange={e => change('sellerBasisConfirmed', e.target.checked)} disabled={busy} /><span>Основание проверено, договорённости с исполнителем и права на материалы оформлены.</span></label>
      </section>
      <section className="admin-section"><h2>Магазин и заметки</h2>{input('productionShopId', 'ShopID рабочего магазина', 'Для учёта. Изменение поля не переключает платёжную интеграцию.', 20)}
        <label>Внутренние заметки<textarea value={form.adminNotes} onChange={e => change('adminNotes', e.target.value)} maxLength={5000} rows={4} disabled={busy} /><span className="admin-hint">Только для администратора. Не вносите пароли, ключи и данные покупателей.</span></label>
      </section>
      <section className="admin-section"><h2>Подтверждение документов</h2><p>Можно сохранять незаполненные реквизиты как проект. До заполнения всех обязательных сведений подтверждение недоступно на сервере. При изменении данных подтверждение нужно повторить.</p>
        <label className="commerce-check"><input type="checkbox" checked={form.legalApproved} onChange={e => change('legalApproved', e.target.checked)} disabled={busy} /><span>Проверил(а) публичные документы и подтверждаю их с указанными реквизитами.</span></label>
        {error && <p className="commerce-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
        <button className="commerce-button" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить сведения'}</button>
      </section>
    </form>
    <section className="admin-section"><h2>Записи лекций</h2><p>Доступ после покупки: 30 дней. Для каждой записи нужны файл и подтверждённые права. Пока файл не подключён, купить запись нельзя.</p><ul className="admin-checklist">{state.lectures.map(p => <li key={p.id}><strong>{p.title}</strong><br />{p.connected ? 'Файл подключён' : 'Нужен файл записи'} · <Link href={'/recordings/' + p.id} target="_blank">Карточка лекции</Link></li>)}</ul></section>
    <section className="admin-section"><h2>Заказы и данные для чеков</h2><p>Последние 50 оплаченных заказов рабочего магазина. Для каждого платежа оформите чек в «Мой налог» и направьте на почту покупки. При возврате скорректируйте сведения в «Мой налог». Сайт не формирует и не подтверждает отправку этих чеков.</p>
      {state.paidOrders.length ? <ul className="admin-checklist">{state.paidOrders.map(o => <li key={o.id}><strong>{o.title}</strong><br />{new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(o.amount / 100)} · {new Date(o.paid_at * 1000).toLocaleString('ru-RU',{timeZone:'Asia/Yekaterinburg'})} (Екатеринбург)<br />{o.status === 'refunded' ? 'Полный возврат' : 'Оплачено'} · {o.email}<br /><span className="admin-hint">Заказ: {o.id}</span></li>)}</ul> : <p>Оплаченных заказов рабочего магазина пока нет.</p>}
    </section>
    <section className="admin-section"><h2>Пароль администратора</h2><form className="commerce-form" onSubmit={password}>
      <label>Текущий пароль<input name="current" type="password" autoComplete="current-password" required maxLength={256} disabled={busy} /></label>
      <label>Новый пароль<input name="replacement" type="password" autoComplete="new-password" required minLength={16} maxLength={256} disabled={busy} /></label>
      <label>Повторите новый пароль<input name="repeat" type="password" autoComplete="new-password" required minLength={16} maxLength={256} disabled={busy} /></label>
      <p className="admin-hint">От 16 символов. После смены пароля все остальные сеансы будут завершены.</p><button className="commerce-button" disabled={busy}>Изменить пароль</button>
    </form></section>
    {error && <p className="commerce-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </>;
}
