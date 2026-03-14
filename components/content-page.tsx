import Image from "next/image";
import type { SitePage } from "@/lib/content";

export function ContentPage({ page }: { page: SitePage }) {
  return (
    <article className="content-page">
      <p className="kicker">{page.kindLabel}</p>
      <h1>{page.title}</h1>

      <div className="content-meta">
        <span>Slug: {page.slug}</span>
        {page.canonical ? <span>Canonical: {page.canonical}</span> : null}
        {page.sourceUrl ? <span>Источник: {page.sourceUrl}</span> : null}
      </div>

      <div className="copy">
        {page.paragraphs.slice(0, 40).map((paragraph, index) => (
          <p key={`${page.slug}-${index}`}>{paragraph}</p>
        ))}
      </div>

      {page.images.length > 0 ? (
        <section className="section-grid">
          <div className="section-heading">
            <h2>Изображения</h2>
          </div>
          <div className="gallery-grid">
            {page.images.slice(0, 12).map((image) => (
              <figure className="gallery-item" key={image}>
                <Image alt={page.title} src={image} width={640} height={480} />
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {page.contacts.length > 0 ? (
        <div className="tag-row">
          {page.contacts.slice(0, 5).map((contact) => (
            <a className="tag" href={contact} key={contact} target="_blank" rel="noreferrer">
              {contact.replace(/^https?:\/\//, "").replace(/^mailto:/, "").replace(/^tel:/, "")}
            </a>
          ))}
        </div>
      ) : null}

      {page.headings.length > 0 ? (
        <div className="tag-row">
          {page.headings.slice(0, 8).map((heading) => (
            <span className="tag" key={`${page.slug}-${heading.level}-${heading.text}`}>
              {heading.text}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
