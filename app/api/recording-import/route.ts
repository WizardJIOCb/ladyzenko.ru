import { NextRequest, NextResponse } from 'next/server';
import { importAuthorized, importAction } from '@/lib/recording-imports';
import { CommerceError } from '@/lib/commerce';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  if(!importAuthorized(req.headers.get('X-Ladyzenko-Source')||''))return new Response(null,{status:404,headers});
  try {
    const text=await req.text();if(text.length>16384)throw new CommerceError(413,'Слишком большой запрос.');
    const data=JSON.parse(text);if(!data || typeof data!=='object' || Array.isArray(data))throw new CommerceError(400,'Некорректный запрос.');
    return NextResponse.json(await importAction(data),{headers});
  } catch(e) {return NextResponse.json({error:e instanceof CommerceError?e.message:'Не удалось обработать запись.'},{status:e instanceof CommerceError?e.status:500,headers});}
}
