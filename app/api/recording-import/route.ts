import { NextRequest, NextResponse } from 'next/server';
import { importAuthorized, importAction } from '@/lib/recording-imports';
import { CommerceError } from '@/lib/commerce';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest) {
  const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
  if(!importAuthorized(req.headers.get('X-Ladyzenko-Source')||''))return new Response(null,{status:404,headers});
  try {
    const limit=128*1024;if(Number(req.headers.get('content-length'))>limit)throw new CommerceError(413,'Слишком большой запрос.');
    const reader=req.body?.getReader();if(!reader)throw new CommerceError(400,'Некорректный запрос.');const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw new CommerceError(413,'Слишком большой запрос.');}chunks.push(part.value);}
    const text=Buffer.concat(chunks).toString('utf8');
    const data=JSON.parse(text);if(!data || typeof data!=='object' || Array.isArray(data))throw new CommerceError(400,'Некорректный запрос.');
    return NextResponse.json(await importAction(data),{headers});
  } catch(e) {return NextResponse.json({error:e instanceof CommerceError?e.message:'Не удалось обработать запись.'},{status:e instanceof CommerceError?e.status:500,headers});}
}
