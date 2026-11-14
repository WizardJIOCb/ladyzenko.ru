import Link from "next/link";
import type { Metadata } from "next";
import { getLecturePages } from "@/lib/content";
import { lectureProducts, formatPrice } from "@/lib/products";

export const metadata: Metadata = {
  title: "Лекции | Людмила Ладыженко",
  description:
    "Лекции Людмилы Ладыженко: отношения, детство, привязанность, подростковый возраст, школа отцов и специальные материалы.",
};

export default function LecturesPage() {
  const lectures = getLecturePages();

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
        {lectureProducts.map(product => <article className="content-card" key={product.id}>
          <p className="content-type">Запись · доступ на 30 дней</p>
          <h2><Link href={`/recordings/${product.id}`}>{product.title}</Link></h2>
          <p>{product.description.slice(0,220)}</p><p>{formatPrice(product.amount)}</p>
          <Link href={`/checkout/${product.id}`}>Условия приобретения</Link>
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
