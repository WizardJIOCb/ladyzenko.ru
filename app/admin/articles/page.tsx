import { cookies } from 'next/headers';
import { adminAuthorized, adminCookie } from '@/lib/admin';
import { articleEditor,articleList } from '@/lib/mirror';
import { AdminPanel } from '@/components/admin-panel';
import { ArticleStudio } from '@/components/article-studio';
import './studio.css';

export const dynamic='force-dynamic';
export const metadata={title:'Редактор статей',robots:{index:false,follow:false}};
export default async function ArticlesAdminPage({searchParams}:{searchParams:Promise<{slug?:string}>}) {
  const session=(await cookies()).get(adminCookie)?.value || '';
  if(!adminAuthorized(session))return <article className="commerce-page admin-page"><AdminPanel initial={null}/></article>;
  const library=articleList(true);
  const {slug}=await searchParams;
  const opened=slug && library.some(p=>p.slug===slug)?articleEditor(slug):null;
  return <ArticleStudio initial={library} opened={opened}/>;
}

