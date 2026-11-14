import type { MetadataRoute } from 'next';
import { lectureProducts } from '@/lib/products';
import { config } from '@/lib/commerce';
import { mirrorPages } from '@/lib/mirror';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = config().origin;
  return [
    ...mirrorPages().map(p => ({ url: origin + p.path, changeFrequency: 'weekly' as const, priority: p.path === '/' ? 1 : 0.7 })),
    ...lectureProducts.map(p => ({ url: origin + '/recordings/' + p.id, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
