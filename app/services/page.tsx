import type { Metadata } from "next";
import Link from "next/link";
import { serviceGroups } from "@/lib/site-copy";

export const metadata: Metadata = {
  title: "Услуги | Людмила Ладыженко",
  description:
    "Консультации, семейные темы, лекции, школа отцов, диагностика и другие форматы работы Людмилы Ладыженко.",
};

export default function ServicesPage() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="kicker">Форматы работы</p>
        <h1>Услуги и направления</h1>
        <p className="lead">
          Здесь собраны основные форматы, с которыми можно начать работу: консультации,
          семейные темы, лекции, школа отцов и диагностические направления.
        </p>
      </section>

      <section className="card-grid compact">
        {serviceGroups.map((group) => (
          <article className="feature-card service-card" key={group.title}>
            <h2>{group.title}</h2>
            <p>{group.description}</p>
            <ul className="service-list">
              {group.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="cta-band">
        <div>
          <p className="kicker">Следующий шаг</p>
          <h2>Можно начать с того формата, который сейчас проще всего</h2>
          <p>
            Если человеку пока комфортнее читать, подойдут статьи. Если нужен более плотный
            и структурный материал, лучше начать с лекций. Если запрос уже созрел, можно
            выходить на личный контакт.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="button primary" href="/articles">
            Перейти к статьям
          </Link>
          <Link className="button secondary" href="/lectures">
            Перейти к лекциям
          </Link>
        </div>
      </section>
    </div>
  );
}
