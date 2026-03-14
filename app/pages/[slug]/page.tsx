import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getGenericPageByRouteSlug, getGenericPages } from "@/lib/content";

export function generateStaticParams() {
  return getGenericPages()
    .filter((page) => page.path.startsWith("/pages/"))
    .map((page) => ({ slug: page.routeSlug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const page = getGenericPageByRouteSlug(slug);
    if (!page) {
      return {};
    }

    return {
      title: page.title,
      description: page.meta_description || page.excerpt,
    };
  });
}

export default async function GenericPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getGenericPageByRouteSlug(slug);
  if (!page || !page.path.startsWith("/pages/")) {
    notFound();
  }

  return <ContentPage page={page} />;
}
