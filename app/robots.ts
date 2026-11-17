import type { MetadataRoute } from "next";
import { config } from '@/lib/commerce';
export const dynamic='force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/commerce/", "/api/admin/", "/api/recording-import", "/api/site/page", "/api/site/feed", "/api/site/contact", "/admin", "/checkout/", "/orders/", "/commerce-private/", "/commerce-remote/"],
    },
    sitemap: `${config().origin}/sitemap.xml`,
  };
}
