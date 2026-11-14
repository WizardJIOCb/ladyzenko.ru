import type { MetadataRoute } from "next";
import { config } from '@/lib/commerce';
export const dynamic='force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/checkout/", "/orders/"],
    },
    sitemap: `${config().origin}/sitemap.xml`,
  };
}
