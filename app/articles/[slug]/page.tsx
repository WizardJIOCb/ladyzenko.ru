import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getArticleByRouteSlug, getArticlePages } from "@/lib/content";

export function generateStaticParams() {
  return getArticlePages().map((article) => ({ slug: article.routeSlug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const page = getArticleByRouteSlug(slug);
    if (!page) {
      return {};
    }

    return {
      title: page.title,
      description: page.meta_description || page.excerpt,
    };
  });
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getArticleByRouteSlug(slug);
  if (!page) {
    notFound();
  }

  return <ContentPage page={page} />;
}
