import {getLectureProducts} from '@/lib/catalogue';
import type { MetadataRoute } from 'next';

import { config } from '@/lib/commerce';
import { articleList,mirrorPages } from '@/lib/mirror';
import { contentPage } from '@/lib/mirror';
import { seoPages,legacyDuplicate,stagingOrigin } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = config().origin;
  // A staging site must not advertise noindex URLs for indexing.
  if(stagingOrigin(origin))return [];
  return [
    ...mirrorPages().filter(p=>!legacyDuplicate(p.path)).map(p => {
      const modified=contentPage(p.slug).published||seoPages()[p.slug]?.modified;
      return { url: origin + p.path, ...(modified?{lastModified:modified}:{}),changeFrequency:'weekly' as const,priority:p.path==='/'?1:0.7 };
    }),
    ...articleList().filter(p=>p.slug.startsWith('tpost-cms')).map(p=>({url:origin+p.path,lastModified:p.modified})),
    ...['/articles','/lectures','/services'].map(p=>({url:origin+p,changeFrequency:'weekly' as const,priority:0.7})),
    ...getLectureProducts().map(p => ({ url: origin + '/recordings/' + p.id, changeFrequency: 'monthly' as const, priority: 0.7 })),
  ];
}
