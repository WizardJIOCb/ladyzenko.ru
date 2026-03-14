import type { MetadataRoute } from "next";
import {
  getArticlePages,
  getGalleryPages,
  getGenericPages,
  getLecturePages,
} from "@/lib/content";
import { siteMeta } from "@/lib/site-copy";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/about",
    "/services",
    "/articles",
    "/lectures",
    "/school-of-fathers",
    "/gallery",
    "/certificates",
    "/media",
  ];

  const dynamicPages = [
    ...getArticlePages(),
    ...getLecturePages().filter((page) => page.path !== "/school-of-fathers"),
    ...getGenericPages(),
    ...getGalleryPages().filter((page) => !["/gallery", "/certificates", "/media"].includes(page.path)),
  ];

  return [
    ...staticPages.map((page) => ({
      url: `${siteMeta.url}${page}`,
      changeFrequency: "weekly" as const,
      priority: page === "" ? 1 : 0.7,
    })),
    ...dynamicPages.map((page) => ({
      url: `${siteMeta.url}${page.path}`,
      changeFrequency: "monthly" as const,
      priority: page.kind === "article" ? 0.8 : 0.7,
    })),
  ];
}
