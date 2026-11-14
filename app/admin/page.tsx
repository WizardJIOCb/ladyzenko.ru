import { cookies } from 'next/headers';
import { adminAuthorized, adminCookie, adminState } from '@/lib/admin';
import { AdminPanel } from '@/components/admin-panel';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Управление оплатой и документами', robots: { index: false, follow: false } };
export default async function Admin() {
  const jar = await cookies();
  const authorized = adminAuthorized(jar.get(adminCookie)?.value || '');
  return <article className="commerce-page admin-page"><AdminPanel initial={authorized ? adminState() : null} /></article>;
}
