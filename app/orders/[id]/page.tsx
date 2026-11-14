import { notFound } from 'next/navigation';
import Link from 'next/link';
import { OrderView } from '@/components/order-view';
export const metadata = { title: 'Ваш заказ | Людмила Ладыженко', robots:{index:false,follow:false}, referrer:'no-referrer' };
export default async function OrderPage({params}:{params:Promise<{id:string}>}) {
  const {id} = await params; if (!/^[a-f0-9]{32}$/.test(id)) notFound();
  return <section className="commerce-page"><Link href="/">← На сайт</Link><OrderView id={id} /></section>;
}
