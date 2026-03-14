import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getLectureByRouteSlug, getLecturePages } from "@/lib/content";

export function generateStaticParams() {
  return getLecturePages()
    .filter((lecture) => lecture.path.startsWith("/lectures/"))
    .map((lecture) => ({ slug: lecture.routeSlug }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const page = getLectureByRouteSlug(slug);
    if (!page) {
      return {};
    }

    return {
      title: page.title,
      description: page.meta_description || page.excerpt,
    };
  });
}

export default async function LectureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = getLectureByRouteSlug(slug);
  if (!page || !page.path.startsWith("/lectures/")) {
    notFound();
  }

  return <ContentPage page={page} />;
}
