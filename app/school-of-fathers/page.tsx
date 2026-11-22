import {getSchoolProducts} from '@/lib/catalogue';
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getLectureByRouteSlug } from "@/lib/content";
import Link from "next/link";
import { formatPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "Школа отцов | Людмила Ладыженко",
  description:
    "Программа школы отцов и связанные лекции о детстве, семье, привязанности и взрослении.",
};

export default function SchoolOfFathersPage() {
  const page = getLectureByRouteSlug("school-of-fathers");
  if (!page) {
    notFound();
  }

  return <div className="page-stack"><ContentPage page={page} />
    <section id="recordings">
      <h2>Записи лекций «Школы отцов»</h2>
      <p>Каждую запись можно приобрести отдельно за 1 000 ₽. Доступ на 30 дней с момента оплаты, просмотр на личной странице заказа. Ссылка придёт на вашу почту.</p>
      <div className="content-list">{getSchoolProducts().map(p => <article className="content-card" key={p.id}>
        <h3><Link href={'/recordings/' + p.id}>{p.title}</Link></h3>
        <p>{p.description}</p><p>{p.duration} · {formatPrice(p.amount)} · 30 дней</p>
        <Link className="commerce-button" href={'/checkout/' + p.id}>Перейти к оплате</Link>
      </article>)}</div>
    </section>
  </div>;
}
