import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { products, type Product } from './products.ts';
import { legalVersion, legalFingerprint, profile, profileGaps } from './legal.ts';

export type Config = {
  origin: string; enabled: boolean; mode: 'test' | 'live'; shopId: string; shopKey: string;
  seller: string; inn: string; contactEmail: string; legalApproved: boolean;
  sellerStatus?: '' | 'selfemployed' | 'ip' | 'company'; registrationNumber?: string; postalAddress?: string; contactPhone?: string;
  sellerBasis?: string; sellerBasisConfirmed?: boolean; productionShopId?: string; adminNotes?: string;
  fiscalizationMethod?: 'npd_manual' | 'provider';
  fiscalizationConfirmed: boolean; receipt?: { vat_code: number; tax_system_code?: number };
  lectureFiles: Record<string, string>; smtp?: { host: string; port: number; user: string; password: string; from: string };
};
export class CommerceError extends Error { constructor(public status: number, message: string) { super(message); } }
function fail(status: number, text: string): never { throw new CommerceError(status, text); }
export const stateDir = () => process.env.COMMERCE_STATE || path.join(process.cwd(), '.commerce');
export function config(): Config {
  const defaults: Config = { origin: 'https://new.ladyzenko.ru', enabled: false, mode: 'test', shopId: '', shopKey: '',
    seller: '', inn: '', contactEmail: '', legalApproved: false, fiscalizationConfirmed: false, lectureFiles: {} };
  const file = path.join(stateDir(), 'config.json');
  return fs.existsSync(file) ? { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) } : defaults;
}
let database: DatabaseSync | undefined;
export function db() {
  if (!database) {
    fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
    database = new DatabaseSync(path.join(stateDir(), 'orders.sqlite'));
    database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;
      CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, product TEXT NOT NULL, email TEXT NOT NULL,
        amount INTEGER NOT NULL, mode TEXT NOT NULL, created INTEGER NOT NULL, status TEXT NOT NULL,
        provider_id TEXT UNIQUE, confirmation TEXT, request TEXT NOT NULL, paid_at INTEGER, expires INTEGER,
        access_days INTEGER, consent TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS refunds(id TEXT PRIMARY KEY, order_id TEXT NOT NULL, amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS outbox(order_id TEXT PRIMARY KEY, sent INTEGER, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, window INTEGER NOT NULL);`);
    fs.chmodSync(path.join(stateDir(), 'orders.sqlite'), 0o600);
  }
  return database;
}
function signingKey() {
  const file = path.join(stateDir(), 'signing-key');
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  try { fs.writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  return fs.readFileSync(file);
}
export function capability(id: string) { return createHmac('sha256', signingKey()).update('order:' + id).digest('hex'); }
export function authorized(id: string, token: string) {
  return /^[a-f0-9]{64}$/.test(token) && timingSafeEqual(Buffer.from(capability(id)), Buffer.from(token));
}
export function rateLimit(client: string) {
  const key = createHmac('sha256', signingKey()).update(client).digest('hex');
  const window = Math.floor(Date.now() / 3600000);
  const row = db().prepare(`INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE
    SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count`).get(key, window) as {count: number};
  db().prepare('DELETE FROM rate_limits WHERE window<?').run(window - 24);
  if (row.count > 30) fail(429, 'Слишком много попыток. Повторите позже.');
}
export function ready(c = config()) {
  const connected = Boolean(c.enabled && c.shopId && c.shopKey && c.seller && c.inn && c.smtp?.host && c.smtp?.user && c.smtp?.password && c.smtp?.from);
  return connected && (c.mode === 'test' || (c.legalApproved && c.fiscalizationConfirmed && profileGaps(c).length === 0));
}
export function mediaFile(productId: string, c = config()) {
  const name = c.lectureFiles[productId];
  if (!name || !/^[a-zA-Z0-9_-]+\.mp4$/.test(name)) return null;
  const base = path.join(stateDir(), 'media');
  const file = path.join(base, name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(base) + path.sep)) return null;
  return name;
}
export function available(product: Product, c = config()) {
  return ready(c) && (product.kind === 'consultation' || Boolean(mediaFile(product.id, c)));
}
export type Order = { id: string; product: string; email: string; amount: number; mode: string; created: number;
  status: string; provider_id: string | null; confirmation: string | null; request: string;
  paid_at: number | null; expires: number | null; access_days: number | null; consent: string };
export function order(id: string) {
  if (!/^[a-f0-9]{32}$/.test(id)) fail(404, 'Заказ не найден.');
  return db().prepare('SELECT * FROM orders WHERE id=?').get(id) as Order | undefined;
}
export async function provider(method: string, resource: string, body?: unknown, idempotency?: string) {
  const c = config();
  const headers: Record<string, string> = { Authorization: 'Basic ' + Buffer.from(c.shopId + ':' + c.shopKey).toString('base64'), 'Content-Type': 'application/json' };
  if (idempotency) headers['Idempotence-Key'] = idempotency;
  try {
    const response = await fetch('https://api.yookassa.ru/v3/' + resource, { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!response.ok) fail(503, 'ЮKassa пока не подтвердила операцию. Повторите проверку этого заказа позже.');
    return await response.json();
  } catch { return fail(503, 'Не удалось связаться с ЮKassa. Сохраните страницу заказа и повторите проверку позже.'); }
}
export function settle(id: string, obj: Record<string, any>) {
  const c = config(); const con = db();
  con.exec('BEGIN IMMEDIATE');
  try {
    const row = order(id); if (!row) fail(404, 'Заказ не найден.');
    const value = `${Math.floor(row.amount / 100)}.${String(row.amount % 100).padStart(2, '0')}`;
    if (obj.amount?.value !== value || obj.amount?.currency !== 'RUB' || obj.metadata?.order_id !== id ||
      String(obj.recipient?.account_id) !== c.shopId || typeof obj.test !== 'boolean' || obj.test !== (row.mode === 'test') ||
      !/^[a-zA-Z0-9-]{10,64}$/.test(obj.id || '') || (row.provider_id && row.provider_id !== obj.id)) fail(409, 'Данные платежа не совпадают с заказом.');
    if (!['pending', 'waiting_for_capture', 'succeeded', 'canceled'].includes(obj.status)) fail(409, 'Неизвестный статус платежа.');
    if (obj.status === 'succeeded' && obj.paid !== true) fail(409, 'Оплата не подтверждена.');
    const url = obj.confirmation?.confirmation_url || row.confirmation || '';
    if (url && !/^https:\/\/(?:[a-z0-9-]+\.)*(?:yookassa\.ru|yoomoney\.ru)\/[^\u0000-\u0020]*$/.test(url)) fail(409, 'Некорректный адрес страницы оплаты.');
    if (!['succeeded', 'refunded', 'canceled'].includes(row.status)) {
      const paid = obj.status === 'succeeded' ? Math.floor(Date.now() / 1000) : null;
      con.prepare('UPDATE orders SET provider_id=?,status=?,confirmation=?,paid_at=?,expires=? WHERE id=?')
        .run(obj.id, obj.status, url, paid, paid && row.access_days ? paid + row.access_days * 86400 : null, id);
      if (paid && row.mode === 'live') con.prepare('INSERT OR IGNORE INTO outbox(order_id) VALUES(?)').run(id);
    }
    con.exec('COMMIT');
  } catch (error) { con.exec('ROLLBACK'); throw error; }
}
export async function reconcile(id: string) {
  const row = order(id); if (!row) fail(404, 'Заказ не найден.');
  if (['succeeded', 'canceled', 'refunded'].includes(row.status)) return;
  if (!row.provider_id && Date.now() / 1000 - row.created > 23 * 3600) fail(409, 'Нужна ручная сверка заказа. Обратитесь по контактам сайта.');
  const obj = row.provider_id ? await provider('GET', 'payments/' + row.provider_id)
    : await provider('POST', 'payments', JSON.parse(row.request), row.id);
  settle(id, obj);
}
export async function checkout(data: Record<string, unknown>, client: string, resumeToken = '') {
  const c = config();
  if (!ready(c)) fail(503, 'Онлайн оплата готовится к запуску. Для записи свяжитесь с Людмилой.');
  const id = data.requestId;
  const product = products.find(p => p.id === data.product);
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || !product) fail(400, 'Обновите страницу и выберите услугу.');
  if (!available(product, c)) fail(409, 'Эта запись пока недоступна для покупки.');
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!/^[^\s@<>\x00-\x1f]+@[^\s@<>\x00-\x1f]+\.[^\s@<>\x00-\x1f]+$/.test(email) || email.length > 254) fail(400, 'Укажите корректную электронную почту.');
  if (data.accepted !== true || data.privacyAccepted !== true || (product.kind === 'consultation' && data.scheduled !== true)) fail(400, 'Подтвердите условия, обработку данных и согласование встречи.');
  rateLimit(client);
  const existing = order(id);
  if (existing && !authorized(id, resumeToken)) fail(403, 'Для продолжения заказа откройте его личную страницу.');
  if (existing && (existing.email !== email || existing.product !== product.id)) fail(409, 'Этот номер заказа уже используется.');
  if (!existing) {
    const body: Record<string, unknown> = {
      amount: { value: (product.amount / 100).toFixed(2), currency: 'RUB' }, capture: true,
      confirmation: { type: 'redirect', return_url: c.origin + '/orders/' + id + '#key=' + capability(id) },
      description: product.title.slice(0, 128), metadata: { order_id: id, product_id: product.id },
    };
    if (c.receipt) body.receipt = { customer: { email }, ...(c.receipt.tax_system_code ? { tax_system_code: c.receipt.tax_system_code } : {}),
      items: [{ description: product.title.slice(0, 128), quantity: '1.00', amount: body.amount, vat_code: c.receipt.vat_code,
        payment_mode: product.kind === 'consultation' ? 'full_prepayment' : 'full_payment', payment_subject: 'service' }] };
    db().prepare(`INSERT INTO orders(id,product,email,amount,mode,created,status,request,access_days,consent)
      VALUES(?,?,?,?,?,?,'creating',?,?,?)`).run(id, product.id, email, product.amount, c.mode, Math.floor(Date.now() / 1000),
        JSON.stringify(body), product.kind === 'lecture' ? 30 : null, JSON.stringify({ offer: legalVersion, privacy: legalVersion, consent: legalVersion,
          fingerprint: legalFingerprint(c), seller: profile(c), accepted: true, privacyAccepted: true, scheduled: data.scheduled === true }));
  }
  await reconcile(id);
  return order(id)!;
}
export function publicOrder(row: Order) {
  const product = products.find(p => p.id === row.product)!;
  const active = row.mode === 'live' && row.status === 'succeeded' && (!row.expires || row.expires > Date.now() / 1000);
  return { id: row.id, product: product.id, title: product.title, kind: product.kind, amount: row.amount, status: row.status,
    test: row.mode === 'test', confirmation: row.status === 'pending' ? row.confirmation : null,
    expires: row.expires, canWatch: active && product.kind === 'lecture' && Boolean(mediaFile(product.id)),
    mailSent: Boolean((db().prepare('SELECT sent FROM outbox WHERE order_id=?').get(row.id) as {sent: number} | undefined)?.sent) };
}
export async function webhook(data: Record<string, any>) {
  if (data.type !== 'notification') fail(400, 'Некорректное уведомление.');
  const id = data.object?.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{10,64}$/.test(id)) fail(400, 'Некорректный идентификатор.');
  if (['payment.succeeded', 'payment.canceled', 'payment.waiting_for_capture'].includes(data.event)) {
    // Notification contents are untrusted: retrieve the object through authenticated provider API.
    const obj = await provider('GET', 'payments/' + id);
    const row = order(obj.metadata?.order_id || '');
    if (row) settle(row.id, obj);
  } else if (data.event === 'refund.succeeded') {
    const obj = await provider('GET', 'refunds/' + id);
    const row = db().prepare('SELECT * FROM orders WHERE provider_id=?').get(obj.payment_id) as Order | undefined;
    if (!row || obj.status !== 'succeeded' || obj.amount?.currency !== 'RUB' || !/^\d+\.\d{2}$/.test(obj.amount?.value || '')) return;
    const amount = Math.round(Number(obj.amount.value) * 100);
    db().exec('BEGIN IMMEDIATE');
    try {
      db().prepare('INSERT OR IGNORE INTO refunds VALUES(?,?,?)').run(id, row.id, amount);
      const total = db().prepare('SELECT SUM(amount) total FROM refunds WHERE order_id=?').get(row.id) as {total: number};
      if (total.total >= row.amount) db().prepare("UPDATE orders SET status='refunded' WHERE id=?").run(row.id);
      db().exec('COMMIT');
    } catch (error) { db().exec('ROLLBACK'); throw error; }
  }
}
export async function work() {
  if (!config().shopKey) return;
  const pending = db().prepare("SELECT id FROM orders WHERE status IN ('creating','pending','waiting_for_capture') ORDER BY created LIMIT 50").all() as {id:string}[];
  for (const row of pending) { try { await reconcile(row.id); } catch { /* retry without creating a new payment */ } }
  const c = config(); if (!c.smtp) return;
  const transport = nodemailer.createTransport({ host: c.smtp.host, port: c.smtp.port, secure: c.smtp.port === 465,
    auth: { user: c.smtp.user, pass: c.smtp.password }, connectionTimeout: 10000, socketTimeout: 20000 });
  const unsent = db().prepare('SELECT order_id FROM outbox WHERE sent IS NULL AND retry_at<? LIMIT 20').all(Math.floor(Date.now()/1000)) as {order_id:string}[];
  for (const item of unsent) {
    const row = order(item.order_id)!; if (row.status !== 'succeeded' || row.mode !== 'live') continue;
    const claimed = db().prepare('UPDATE outbox SET attempts=attempts+1,retry_at=? WHERE order_id=? AND sent IS NULL AND retry_at<?')
      .run(Math.floor(Date.now()/1000)+300, row.id, Math.floor(Date.now()/1000));
    if (!claimed.changes) continue;
    const p = products.find(p => p.id === row.product)!;
    const url = c.origin + '/orders/' + row.id + '#key=' + capability(row.id);
    try {
      await transport.sendMail({ from: c.smtp.from, to: row.email, subject: 'Оплата подтверждена: ' + p.title,
        text: `Оплата ${p.title} подтверждена.\nНомер заказа: ${row.id}\n` +
          (p.kind === 'lecture' ? 'Доступ к записи: 30 дней с момента оплаты.\n' : 'Встреча пройдёт в согласованное с Людмилой время.\n') +
          `Ваша личная страница заказа: ${url}\nНе передавайте ссылку другим людям.\n` +
          (c.fiscalizationMethod === 'npd_manual' ? 'Чек продавец сформирует вручную в сервисе «Мой налог» и направит на почту покупки отдельно от этого подтверждения.\n' : '') +
          `Поддержка: ${c.contactEmail}` });
      db().prepare('UPDATE outbox SET sent=? WHERE order_id=?').run(Math.floor(Date.now()/1000), row.id);
    } catch { /* persistent outbox retries on the next worker invocation */ }
  }
}
