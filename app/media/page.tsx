import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPageBySlug } from "@/lib/content";

export const metadata: Metadata = {
  title: "Видео и подкасты | Людмила Ладыженко",
  description: "Видео, подкасты и дополнительные медиа-материалы Людмилы Ладыженко.",
};

export default function MediaPage() {
  const page = getPageBySlug("video");
  if (!page) {
    notFound();
  }

  return <ContentPage page={page} />;
}
