import { NextRequest } from 'next/server';
import { renderMirror } from '@/lib/mirror';
import { config, CommerceError } from '@/lib/commerce';
import { adminAuthorized, adminCookie } from '@/lib/admin';
export const dynamic='force-dynamic';
export function GET(req: NextRequest) {
  try {
    const preview=req.nextUrl.searchParams.get('preview')==='1';
    if(preview && !adminAuthorized(req.cookies.get(adminCookie)?.value||''))throw new CommerceError(401,'Войдите в админку для просмотра черновика.');
    return new Response(renderMirror(req.nextUrl.searchParams.get('slug')||'index',config().origin,preview),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  } catch(e) {return new Response(e instanceof CommerceError?e.message:'Страница недоступна.',{status:e instanceof CommerceError?e.status:500});}
}
