import type { Config } from '@/lib/commerce';
import { profile, sellerStatuses } from '@/lib/legal';
export function SellerDetails({ config: c }: { config: Config }) {
  const p = profile(c); const status = sellerStatuses[p.sellerStatus as keyof typeof sellerStatuses];
  return <><p>{p.seller || 'Реквизиты продавца будут опубликованы до запуска оплаты.'}</p>
    {status && <p>Статус: {status}.</p>}{p.inn && <p>ИНН: {p.inn}</p>}
    {p.registrationNumber && ['ip', 'company'].includes(p.sellerStatus) && <p>{p.sellerStatus === 'ip' ? 'ОГРНИП' : 'ОГРН'}: {p.registrationNumber}</p>}
    {p.postalAddress && <p>Почтовый адрес для обращений: {p.postalAddress}</p>}
    {p.contactEmail && <p>Оплата, возвраты и обращения по персональным данным: <a href={'mailto:' + p.contactEmail}>{p.contactEmail}</a>.</p>}
    {p.contactPhone && <p>Телефон: <a href={'tel:+' + p.contactPhone.replace(/\D/g, '')}>{p.contactPhone}</a>.</p>}
  </>;
}
