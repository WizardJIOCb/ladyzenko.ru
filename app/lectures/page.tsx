import Link from "next/link";
import type { Metadata } from "next";
import { getLecturePages } from "@/lib/content";
import { lectureProducts, formatPrice } from "@/lib/products";
import { available, config, listedLectures } from '@/lib/commerce';
export const dynamic='force-dynamic';

export const metadata: Metadata = {
  title: "Лекции | Людмила Ладыженко",
  description:
    "Лекции Людмилы Ладыженко: отношения, детство, привязанность, подростковый возраст, школа отцов и специальные материалы.",
};

export default function LecturesPage() {
  const lectures = getLecturePages();
  const c=config();const sorted=listedLectures(c).sort((a,b)=>Number(available(b,c))-Number(available(a,c)));

  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="kicker">Раздел</p>
        <h1>Лекции и тематические материалы</h1>
        <p className="lead">
          Здесь собраны лекции, школа отцов и специальные материалы о привязанности,
          взрослении, детстве, отношениях, сексуальности и семейной динамике.
        </p>
      </section>

      <div className="content-list">
        {sorted.map(product => <article className="content-card" key={product.id}>
          <p className="content-type">{available(product,c)?'Можно купить · доступ на 30 дней':'Запись готовится к продаже'}</p>
          <h2><Link href={`/recordings/${product.id}`}>{product.title}</Link></h2>
          <p>{product.description.slice(0,220)}</p><p>{formatPrice(product.amount)}</p>
          <Link className="commerce-button" href={available(product,c)?`/checkout/${product.id}`:`/recordings/${product.id}`}>{available(product,c)?'Купить запись':'Подробнее о лекции'}</Link>
        </article>)}
      </div>
      <h2>Другие лекции и тематические материалы</h2>
      <div className="content-list">
        {lectures.map((lecture) => (
          <article className="content-card" key={lecture.slug}>
            <p className="content-type">Лекция</p>
            <h2>
              <Link href={lecture.path}>{lecture.title}</Link>
            </h2>
            <p>{lecture.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
