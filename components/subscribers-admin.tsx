'use client';
import { useEffect, useState } from 'react';
import type { Subscriber } from '@/lib/newsletter';

export function SubscribersAdmin() {
  const [rows, setRows] = useState<Subscriber[] | null>(null);
  const [error, setError] = useState('');
  const [removeError, setRemoveError] = useState('');
  async function unsubscribe(email: string) {
    if (!window.confirm('Удалить ' + email + ' из списка рассылки?')) return;
    setRemoveError('');
    try {
      const response = await fetch('/api/admin/unsubscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email})});
      if (!response.ok) throw new Error();
      setRows(current => current?.filter(row => row.email !== email) ?? null);
    } catch { setRemoveError('Не удалось удалить адрес. Попробуйте ещё раз.'); }
  }
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/admin/subscribers', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        setRows(await response.json());
      } catch {
        if (!controller.signal.aborted) setError('Не удалось загрузить подписчиков. Обновите страницу.');
      }
    }
    void load();
    return () => controller.abort();
  }, []);
  return <section className="admin-section" id="subscribers">
    <h2>Подписчики рассылки</h2>
    {error ? <p role="alert">{error}</p> : rows === null ? <p>Загружаем список…</p> : rows.length === 0 ?
      <p>Пока нет подписчиков. Здесь появятся адреса из формы внизу главной страницы.</p> :
      <><p>Адресов с согласием на рассылку: {rows.length} · <a href="/api/admin/subscribers-csv" download>Скачать CSV</a></p>
        <div className="subscribers-list"><table><thead><tr><th>Электронная почта</th><th>Дата подписки</th><th>Действие</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.email}><td>{row.email}</td><td>{new Date(row.created).toLocaleString('ru-RU')}</td><td><button type="button" onClick={() => unsubscribe(row.email)}>Отписать</button></td></tr>)}</tbody>
        </table></div></>}
    {removeError && <p role="alert">{removeError}</p>}
  </section>;
}
