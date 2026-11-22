import {getProducts,detailsVersion} from '@/lib/catalogue';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { formatPrice } from '@/lib/products';
import { available, config } from '@/lib/commerce';
import { CheckoutForm } from '@/components/checkout-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Оплата | Людмила Ладыженко', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Checkout({ params }: {params: Promise<{product:string}>}) {
  const { product: id } = await params; const product = getProducts().find(p => p.id === id);
  if (!product) notFound(); const c = config();
  return <section className="commerce-page"><Link href="/">← На сайт</Link><p className="kicker">Оформление заказа</p>
    <h1>{product.title}</h1><p>{product.description}</p>{product.duration ? <p>Продолжительность: {product.duration}</p> : null}
    {product.kind === 'lecture' ? <p>Доступ к записи: 30 дней с момента оплаты. Ссылка придёт на вашу почту. Для просмотра нужен одноразовый код с почты покупки; доступен один активный сеанс. Запись предназначена для личного просмотра.</p> : null}
    <p className="commerce-price">{formatPrice(product.amount)}</p>
    <CheckoutForm key={id} product={product} offerVersion={detailsVersion(product)} enabled={available(product,c)} test={c.mode === 'test'} />
    <p><Link href="/payment-info">Продавец, оплата и возвраты</Link></p></section>;
}
