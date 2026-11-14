import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { CommerceError, config, stateDir, mediaDelivery, ready, db, type Config } from './commerce.ts';
import { profile, profileGaps, profileKeys, legalVersion } from './legal.ts';
import { products } from './products.ts';

export const adminCookie = 'ladyzenko_admin';
const lifetime = 8 * 3600;
type Auth = { salt: string; hash: string; key: string };
function auth(): Auth | null {
  const file = path.join(stateDir(), 'admin-auth.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function same(a: string, b: string) { return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function setupAdmin(password: string) {
  if (password.length < 16 || password.length > 256) throw new Error('Пароль должен содержать от 16 до 256 символов.');
  const salt = randomBytes(32).toString('hex');
  const record: Auth = { salt, hash: scryptSync(password, salt, 64).toString('hex'), key: randomBytes(32).toString('hex') };
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  const file = path.join(stateDir(), 'admin-auth.json');
  const temp = file + '.' + randomBytes(8).toString('hex');
  fs.writeFileSync(temp, JSON.stringify(record), { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file);
}
export function login(password: unknown, now = Math.floor(Date.now() / 1000)) {
  const a = auth(); if (!a) throw new CommerceError(503, 'Вход ещё не настроен владельцем сервера.');
  if (typeof password !== 'string' || password.length > 256 || !same(scryptSync(password, a.salt, 64).toString('hex'), a.hash)) throw new CommerceError(401, 'Неверный пароль.');
  const payload = `${now + lifetime}.${randomBytes(16).toString('hex')}`;
  return payload + '.' + createHmac('sha256', a.key).update(payload).digest('hex');
}
export function adminAuthorized(token: string, now = Math.floor(Date.now() / 1000)) {
  if (!/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const a = auth(); if (!a) return false;
  const [expires, nonce, signature] = token.split('.');
  return Number(expires) > now && Number(expires) <= now + lifetime && same(signature, createHmac('sha256', a.key).update(expires + '.' + nonce).digest('hex'));
}
export function changePassword(current: unknown, replacement: unknown) {
  login(current);
  if (typeof replacement !== 'string' || replacement.length < 16 || replacement.length > 256) throw new CommerceError(400, 'Новый пароль должен содержать от 16 до 256 символов.');
  setupAdmin(replacement); return login(replacement);
}
export function configRevision() { return createHash('sha256').update(fs.existsSync(path.join(stateDir(), 'config.json')) ? fs.readFileSync(path.join(stateDir(), 'config.json')) : '').digest('hex'); }
export function adminState() {
  const c = config();
  return { revision: configRevision(), profile: profile(c), productionShopId: c.productionShopId || '', adminNotes: c.adminNotes || '',
    version: legalVersion, gaps: profileGaps(c), legalApproved: c.legalApproved,
    payment: { enabled: c.enabled, mode: c.mode, shopId: c.shopId, keyConfigured: Boolean(c.shopKey), fiscalizationConfirmed: c.fiscalizationConfirmed, fiscalizationMethod: c.fiscalizationMethod || '',
      smtpConfigured: Boolean(c.smtp?.host && c.smtp?.user && c.smtp?.password && c.smtp?.from), ready: ready(c) },
    lectures: products.filter(p => p.kind === 'lecture').map(p => ({ id: p.id, title: p.title, connected: Boolean(mediaDelivery(p.id, c)), accessDays: 30 })),
    paidOrders: (db().prepare("SELECT id,product,email,amount,status,paid_at FROM orders WHERE mode='live' AND status IN ('succeeded','refunded') ORDER BY paid_at DESC LIMIT 50").all() as {id:string;product:string;email:string;amount:number;status:string;paid_at:number}[])
      .map(o => ({ ...o, title: products.find(p => p.id === o.product)?.title || o.product })) };
}
export function saveAdmin(data: Record<string, unknown>) {
  const allowed = [...profileKeys, 'productionShopId', 'adminNotes', 'legalApproved', 'revision'];
  if (Object.keys(data).some(k => !allowed.includes(k as typeof allowed[number]))) throw new CommerceError(400, 'Запрос содержит неподдерживаемые настройки.');
  if (data.revision !== configRevision()) throw new CommerceError(409, 'Настройки изменились. Обновите страницу перед сохранением.');
  const c = config(); const next: Config = { ...c };
  for (const key of profileKeys) {
    if (key === 'sellerBasisConfirmed') { if (typeof data[key] !== 'boolean') throw new CommerceError(400, 'Подтвердите основание продажи.'); next[key] = data[key]; continue; }
    if (typeof data[key] !== 'string') throw new CommerceError(400, 'Проверьте заполнение полей.');
    const value = data[key].trim();
    if (value.length > (['sellerBasis', 'postalAddress'].includes(key) ? 2000 : 254) || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value)) throw new CommerceError(400, 'Поле содержит недопустимый текст.');
    Object.assign(next, { [key]: value });
  }
  if (!['', 'selfemployed', 'ip', 'company'].includes(next.sellerStatus || '')) throw new CommerceError(400, 'Выберите статус продавца.');
  if (next.inn && !/^\d{10}(\d{2})?$/.test(next.inn)) throw new CommerceError(400, 'ИНН должен содержать 10 или 12 цифр.');
  if (next.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.contactEmail)) throw new CommerceError(400, 'Проверьте адрес электронной почты.');
  for (const key of ['productionShopId', 'adminNotes'] as const) {
    if (typeof data[key] !== 'string' || data[key].length > (key === 'adminNotes' ? 5000 : 20)) throw new CommerceError(400, 'Проверьте настройки магазина и заметки.');
    next[key] = data[key].trim();
  }
  if (next.productionShopId && !/^\d{1,20}$/.test(next.productionShopId)) throw new CommerceError(400, 'ShopID должен содержать только цифры.');
  if (typeof data.legalApproved !== 'boolean') throw new CommerceError(400, 'Проверьте подтверждение документов.');
  const gaps = profileGaps(next);
  if (data.legalApproved && gaps.length) throw new CommerceError(400, 'Сначала заполните: ' + gaps.join('; ') + '. Можно сохранить без подтверждения.');
  next.legalApproved = data.legalApproved;
  // Only the legal profile is editable. Payment credentials, mode and fiscal settings stay server controlled.
  const file = path.join(stateDir(), 'config.json'); const temp = file + '.' + randomBytes(8).toString('hex');
  if (fs.existsSync(file)) { fs.copyFileSync(file, path.join(stateDir(), 'config.before-admin.json')); fs.chmodSync(path.join(stateDir(), 'config.before-admin.json'), 0o600); }
  fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, file);
  return adminState();
}
