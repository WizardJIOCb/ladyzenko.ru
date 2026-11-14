import { createHash } from 'node:crypto';
import type { Config } from './commerce.ts';

export const legalVersion = '2026-11-14.2';
export const sellerStatuses = { selfemployed: 'Самозанятый, плательщик НПД', ip: 'Индивидуальный предприниматель', company: 'Юридическое лицо' };
export const profileKeys = ['seller', 'inn', 'sellerStatus', 'registrationNumber', 'postalAddress', 'contactEmail', 'contactPhone', 'sellerBasis', 'sellerBasisConfirmed'] as const;
export function profile(c: Config) {
  return { seller: c.seller, inn: c.inn, sellerStatus: c.sellerStatus || '', registrationNumber: c.registrationNumber || '',
    postalAddress: c.postalAddress || '', contactEmail: c.contactEmail, contactPhone: c.contactPhone ?? '+7 917 754 23 23',
    sellerBasis: c.sellerBasis || '', sellerBasisConfirmed: c.sellerBasisConfirmed === true };
}
export function profileGaps(c: Config) {
  const p = profile(c); const missing: string[] = [];
  if (!p.seller.trim()) missing.push('Наименование или ФИО продавца');
  if (!/^\d{10}(\d{2})?$/.test(p.inn)) missing.push('ИНН продавца');
  if (!(p.sellerStatus in sellerStatuses)) missing.push('Статус продавца по договору ЮKassa');
  if (p.sellerStatus === 'company' && !/^\d{10}$/.test(p.inn)) missing.push('ИНН организации из 10 цифр');
  if (['selfemployed', 'ip'].includes(p.sellerStatus) && !/^\d{12}$/.test(p.inn)) missing.push('ИНН физического лица или ИП из 12 цифр');
  if (p.sellerStatus === 'ip' && !/^\d{15}$/.test(p.registrationNumber)) missing.push('ОГРНИП из 15 цифр');
  if (p.sellerStatus === 'company' && !/^\d{13}$/.test(p.registrationNumber)) missing.push('ОГРН из 13 цифр');
  if (p.postalAddress.trim().length < 10) missing.push('Почтовый адрес продавца для обращений');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contactEmail)) missing.push('Почта для оплаты и возвратов');
  if (p.contactPhone.replace(/\D/g, '').length < 10) missing.push('Телефон для обращений');
  if (!p.sellerBasisConfirmed || p.sellerBasis.trim().length < 10) missing.push('Основание продажи услуг и записей Людмилы от имени продавца');
  return missing;
}
export function legalFingerprint(c: Config) {
  return createHash('sha256').update(JSON.stringify({ version: legalVersion, ...profile(c) })).digest('hex');
}
