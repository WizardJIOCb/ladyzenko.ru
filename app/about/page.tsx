import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPageBySlug } from "@/lib/content";

export const metadata: Metadata = {
  title: "Обо мне | Людмила Ладыженко",
  description:
    "Биография, профессиональный путь и подход психолога Людмилы Ладыженко.",
};

export default function AboutPage() {
  const page = getPageBySlug("obo_mne");
  if (!page) {
    notFound();
  }

  return <ContentPage page={page} />;
}
