import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ContentPage } from "@/components/content-page";
import { getLectureByRouteSlug } from "@/lib/content";

export const metadata: Metadata = {
  title: "Школа отцов | Людмила Ладыженко",
  description:
    "Программа школы отцов и связанные лекции о детстве, семье, привязанности и взрослении.",
};

export default function SchoolOfFathersPage() {
  const page = getLectureByRouteSlug("school-of-fathers");
  if (!page) {
    notFound();
  }

  return <ContentPage page={page} />;
}
