import fs from "node:fs";
import path from "node:path";

type RawPage = {
  url: string;
  slug: string;
  title: string;
  meta_description: string;
  meta_keywords: string;
  h1: string[];
  headings: Array<{ level: string; text: string }>;
  text: string;
  paragraphs: string[];
  popups: Array<{ title: string; text: string }>;
  images: string[];
  files: string[];
  videos: Array<{ type: string; src: string }>;
  contacts: string[];
  links: string[];
  canonical: string;
  og_image: string;
};

export type SitePage = {
  slug: string;
  routeSlug: string;
  title: string;
  excerpt: string;
  paragraphs: string[];
  images: string[];
  headings: Array<{ level: string; text: string }>;
  canonical: string;
  meta_description: string;
  sourceUrl: string;
  contacts: string[];
  path: string;
  legacyPath: string;
  kind: "article" | "lecture" | "gallery" | "page";
  kindLabel: string;
};

type HomeData = {
  heroImage: string;
  tagline: string;
  about: string[];
  helpsWith: string[];
  workFormats: string[];
  bookingLink: string;
  contacts: Array<{ label: string; href: string }>;
};

const PAGES_DIR = path.join(process.cwd(), "export", "pages");
const RAW_HTML_DIR = path.join(process.cwd(), "export", "raw_html");

function readRawPages(): RawPage[] {
  const fileNames = fs.readdirSync(PAGES_DIR).filter((fileName) => fileName.endsWith(".json"));

  return fileNames.map((fileName) => {
    const fullPath = path.join(PAGES_DIR, fileName);
    return JSON.parse(fs.readFileSync(fullPath, "utf8")) as RawPage;
  });
}

function readRawHtml(slug: string): string {
  return fs.readFileSync(path.join(RAW_HTML_DIR, `${slug}.html`), "utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractFieldTexts(slug: string): string[] {
  const html = readRawHtml(slug);
  const matches = [...html.matchAll(/field="text"[^>]*>([\s\S]*?)<\/div>/g)];
  return matches.map((match) => stripHtml(match[1])).filter(Boolean);
}

function articleRouteSlug(url: string): string {
  const value = url.split("/tpost/")[1] || "";
  return value.replace(/\/+$/, "");
}

function lectureRouteSlug(slug: string): string {
  if (slug === "shkolaotcov" || slug === "sckolaotzov") {
    return "school-of-fathers";
  }

  return slug.replace(/_/g, "-");
}

function inferKind(page: RawPage): SitePage["kind"] {
  if (page.url.includes("/tpost/")) {
    return "article";
  }

  if (
    page.slug.startsWith("lekciya_") ||
    new Set(["lekciyaprolubov", "umor", "detskii_rai", "odegda", "shkolaotcov", "sckolaotzov"]).has(page.slug)
  ) {
    return "lecture";
  }

  if (new Set(["foto", "diplom", "video"]).has(page.slug)) {
    return "gallery";
  }

  return "page";
}

function toExcerpt(page: RawPage): string {
  const sourceText = page.meta_description || page.paragraphs.find((item) => item.length > 80) || page.text;
  return sourceText.slice(0, 220).trim();
}

function buildPath(page: RawPage, kind: SitePage["kind"], routeSlug: string): string {
  if (page.slug === "index" || page.slug === "new") {
    return "/";
  }

  if (page.slug === "obo_mne") {
    return "/about";
  }

  if (page.slug === "diplom") {
    return "/certificates";
  }

  if (page.slug === "video") {
    return "/media";
  }

  if (page.slug === "foto") {
    return "/gallery";
  }

  if (kind === "article") {
    return `/articles/${routeSlug}`;
  }

  if (kind === "lecture" && routeSlug === "school-of-fathers") {
    return "/school-of-fathers";
  }

  if (kind === "lecture") {
    return `/lectures/${routeSlug}`;
  }

  return `/pages/${routeSlug}`;
}

function toSitePage(page: RawPage): SitePage {
  const kind = inferKind(page);
  const routeSlug =
    kind === "article"
      ? articleRouteSlug(page.url)
      : kind === "lecture"
        ? lectureRouteSlug(page.slug)
        : page.slug;

  const kindLabelMap: Record<SitePage["kind"], string> = {
    article: "Статья",
    lecture: "Лекция",
    gallery: "Галерея",
    page: "Страница",
  };

  const popupParagraphs = page.popups.flatMap((popup) => [popup.title, popup.text].filter(Boolean));
  const paragraphs = page.paragraphs.length > 1 ? page.paragraphs : popupParagraphs;

  return {
    slug: page.slug,
    routeSlug,
    title: page.title || page.h1[0] || page.slug,
    excerpt: toExcerpt(page),
    paragraphs,
    images: page.images,
    headings: page.headings,
    canonical: page.canonical,
    meta_description: page.meta_description,
    sourceUrl: page.url,
    contacts: page.contacts,
    path: buildPath(page, kind, routeSlug),
    legacyPath: new URL(page.url).pathname || "/",
    kind,
    kindLabel: kindLabelMap[kind],
  };
}

let cachedPages: SitePage[] | null = null;

function getAllPages(): SitePage[] {
  if (!cachedPages) {
    cachedPages = readRawPages()
      .map(toSitePage)
      .filter((page) => page.slug !== "new")
      .sort((left, right) => left.title.localeCompare(right.title, "ru"));
  }

  return cachedPages;
}

export function getPageBySlug(slug: string): SitePage | undefined {
  return getAllPages().find((page) => page.slug === slug);
}

export function getArticlePages(): SitePage[] {
  return getAllPages().filter((page) => page.kind === "article");
}

export function getArticleByRouteSlug(routeSlug: string): SitePage | undefined {
  return getArticlePages().find((page) => page.routeSlug === routeSlug);
}

export function getLecturePages(): SitePage[] {
  return getAllPages().filter((page) => page.kind === "lecture");
}

export function getLectureByRouteSlug(routeSlug: string): SitePage | undefined {
  return getLecturePages().find((page) => page.routeSlug === routeSlug);
}

export function getGalleryPages(): SitePage[] {
  return getAllPages().filter((page) => page.kind === "gallery");
}

export function getGenericPages(): SitePage[] {
  return getAllPages().filter((page) => page.kind === "page");
}

export function getGenericPageByRouteSlug(routeSlug: string): SitePage | undefined {
  return getGenericPages().find((page) => page.routeSlug === routeSlug);
}

export function getFeaturedArticles(limit: number): SitePage[] {
  return getArticlePages().slice(0, limit);
}

export function getFeaturedLectures(limit: number): SitePage[] {
  return getLecturePages().slice(0, limit);
}

export function getSiteOverview() {
  const pages = getAllPages();
  const galleryImageCount = getGalleryPages().reduce((count, page) => count + page.images.length, 0);

  return {
    pageCount: pages.length,
    articleCount: getArticlePages().length,
    lectureCount: getLecturePages().length,
    galleryImageCount,
  };
}

function normalizeContact(contact: string): { label: string; href: string } | null {
  if (contact.startsWith("tel:")) {
    return { label: "Позвонить", href: contact };
  }

  if (contact.startsWith("mailto:")) {
    return { label: "Написать на Email", href: contact };
  }

  if (contact.includes("wa.me") || contact.includes("whatsapp")) {
    return { label: "WhatsApp", href: contact };
  }

  if (contact.includes("t.me/")) {
    return { label: "Telegram", href: contact };
  }

  if (contact.includes("vk.com")) {
    return { label: "ВКонтакте", href: contact };
  }

  return null;
}

export function getHomeData(): HomeData {
  const indexPage = getPageBySlug("index");
  const aboutPage = getPageBySlug("obo_mne");
  const aboutBlocks = extractFieldTexts("obo_mne");
  const rawContacts = indexPage?.contacts || [];

  const about = aboutBlocks[0]
    ? aboutBlocks[0].split("\n").filter(Boolean)
    : [
        "Опытный психолог, частная практика 28 лет, онлайн и очно.",
        "Баланс мира внешнего и внутреннего помогает человеку становиться собой и опираться на собственную зрелость.",
      ];

  const helpsWith = aboutBlocks[1]
    ? aboutBlocks[1]
        .split("\n")
        .filter((item) => item.startsWith("*") || item.startsWith("-"))
        .map((item) => item.replace(/^[*-]\s*/, ""))
    : [];

  const workFormats = aboutBlocks[2]
    ? aboutBlocks[2]
        .split("\n")
        .filter((item) => item.startsWith("*") || item.startsWith("-"))
        .map((item) => item.replace(/^[*-]\s*/, ""))
    : [];

  const contacts = rawContacts
    .map(normalizeContact)
    .filter((item): item is { label: string; href: string } => Boolean(item))
    .filter((item, index, items) => items.findIndex((other) => other.label === item.label && other.href === item.href) === index)
    .slice(0, 4);

  const bookingLink =
    rawContacts.find((contact) => contact.includes("записаться") || contact.includes("%D0%B7%D0%B0%D0%BF%D0%B8%D1%81%D0%B0%D1%82%D1%8C%D1%81%D1%8F")) ||
    rawContacts.find((contact) => contact.includes("whatsapp") || contact.includes("wa.me")) ||
    "https://wa.me/79177542323";

  return {
    heroImage: aboutPage?.images[0] || indexPage?.images[0] || "",
    tagline:
      'Уточнить картину мира внешнего и внутреннего с опытным экспертом для обретения баланса жизни. Это и есть зрелость.',
    about,
    helpsWith,
    workFormats,
    bookingLink,
    contacts,
  };
}

export function getLegacyRedirects() {
  return getAllPages()
    .map((page) => ({
      source: page.legacyPath,
      destination: page.path,
    }))
    .filter((redirect) => redirect.source && redirect.source !== redirect.destination);
}
