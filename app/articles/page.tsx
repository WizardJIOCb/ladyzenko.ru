import Link from "next/link";
import type { Metadata } from "next";
import { getArticlePages } from "@/lib/content";

export const metadata: Metadata = {
  title: "Статьи | Людмила Ладыженко",
  description:
    "Психологические статьи и публикации Людмилы Ладыженко: отношения, взросление, самоощущение, семья и внутренняя опора.",
};

export default function ArticlesPage() {
  const articles = getArticlePages();

  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="kicker">Раздел</p>
        <h1>Статьи и публикации</h1>
        <p className="lead">
          Здесь собраны авторские материалы о любви, отношениях, взрослении, внутренней
          зрелости, детстве, опоре, семье и психологической реальности человека.
        </p>
      </section>

      <div className="content-list">
        {articles.map((article) => (
          <article className="content-card" key={article.slug}>
            <p className="content-type">Статья</p>
            <h2>
              <Link href={article.path}>{article.title}</Link>
            </h2>
            <p>{article.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
