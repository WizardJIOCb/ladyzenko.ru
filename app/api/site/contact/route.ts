import { NextRequest,NextResponse } from 'next/server';
import { CommerceError,rateLimit,trustedOrigin } from '@/lib/commerce';
import { saveSubmission } from '@/lib/mirror';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest){
  try{
    if(!trustedOrigin(req.headers.get('origin')))throw new CommerceError(403,'Обновите страницу сайта.');
    rateLimit('subscription:'+(req.headers.get('x-real-ip')||'unknown'));
    if(Number(req.headers.get('content-length'))>4096)throw new CommerceError(413,'Слишком большой запрос.');
    const text=await req.text();if(text.length>4096)throw new CommerceError(413,'Слишком большой запрос.');
    let d;try{d=JSON.parse(text);}catch{throw new CommerceError(400,'Некорректный запрос.');}
    if(!d || typeof d.email!=='string' || d.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) || d.consent!==true)throw new CommerceError(400,'Укажите email и подтвердите согласие.');
    return NextResponse.json({ok:true,id:saveSubmission(d.email.trim().toLowerCase(),typeof d.page==='string'?d.page.slice(0,500):'/')},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return NextResponse.json({error:e instanceof CommerceError?e.message:'Не удалось сохранить заявку.'},{status:e instanceof CommerceError?e.status:500});}
}
