import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getPageBySlug } from "@/lib/content";

export const metadata: Metadata = {
  title: "Дипломы и сертификаты | Людмила Ладыженко",
  description: "Дипломы, сертификаты и подтверждение профессионального пути Людмилы Ладыженко.",
};

export default function CertificatesPage() {
  const page = getPageBySlug("diplom");
  if (!page) {
    notFound();
  }

  return <ContentPage page={page} />;
}
