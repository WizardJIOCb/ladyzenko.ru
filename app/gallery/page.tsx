import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getGalleryPages } from "@/lib/content";

export const metadata: Metadata = {
  title: "Галерея | Людмила Ладыженко",
  description:
    "Фотографии, дипломы, сертификаты и визуальные материалы Людмилы Ладыженко.",
};

export default function GalleryPage() {
  const galleryPages = getGalleryPages();

  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="kicker">Раздел</p>
        <h1>Галерея и документы</h1>
        <p className="lead">
          Фотографии, дипломы и визуальные материалы из экспортированной версии сайта.
        </p>
      </section>

      {galleryPages.map((page) => (
        <section className="gallery-block" key={page.slug}>
          <div className="section-heading inline">
            <div>
              <h2>{page.title}</h2>
              <p>{page.excerpt}</p>
            </div>
            <Link href={page.path}>Открыть страницу</Link>
          </div>

          <div className="gallery-grid">
            {page.images.slice(0, 12).map((image) => (
              <figure className="gallery-item" key={image}>
                <Image alt={page.title} src={image} width={600} height={420} />
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
