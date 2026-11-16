import { notFound } from 'next/navigation';
import Link from 'next/link';
import { lectureProducts, formatPrice } from '@/lib/products';
import { available } from '@/lib/commerce';
export const dynamic='force-dynamic';
export default async function Recording({params}:{params:Promise<{id:string}>}) {
  const {id} = await params; const p = lectureProducts.find(p=>p.id===id); if (!p) notFound();
  return <article className="commerce-page"><Link href="/lectures">← Все записи</Link><h1>{p.title}</h1>
    {p.image ? <img src={p.image} alt={p.title} width="480" /> : null}
    {p.description.split('\n').map((text,i)=><p key={i}>{text}</p>)}
    {p.duration ? <p>Продолжительность: {p.duration}.</p> : null}
    <p className="commerce-price">{formatPrice(p.amount)}</p><p>Доступ к записи: 30 дней с момента оплаты. После подтверждения оплаты запись откроется на личной странице заказа; ссылка придёт на указанную почту.</p>
    {available(p)?<Link className="commerce-button" href={'/checkout/'+id}>Купить запись</Link>:<><p className="commerce-notice">Полная запись ещё не подключена. Покупка откроется после её проверки.</p><Link href="/lectures">Выбрать доступную запись</Link></>}</article>;
}
