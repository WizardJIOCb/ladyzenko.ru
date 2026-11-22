import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized, adminCookie, adminState, login, saveAdmin, changePassword } from '@/lib/admin';
import { CommerceError, config, rateLimit, trustedOrigin } from '@/lib/commerce';
import { mirrorPages,contentPage,saveContent,submissions,storeImage } from '@/lib/mirror';
import { recordingImports, saveRecordingImport } from '@/lib/recording-imports';
import { recordingPoster, recordingVideo } from '@/lib/recording-media';
import {saveLectureDetails} from '@/lib/catalogue';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
async function handle(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await ctx.params;
    if (req.method === 'POST' && !trustedOrigin(req.headers.get('origin'))) throw new CommerceError(403, 'Обновите страницу админки.');
    if (req.method === 'POST' && action === 'login') rateLimit('admin-login:' + (req.headers.get('x-real-ip') || 'unknown'));
    const authenticated = adminAuthorized(req.cookies.get(adminCookie)?.value || '');
    if (action !== 'login' && !authenticated) throw new CommerceError(401, 'Войдите в админку.');
    if(action==='recording-poster'&&req.method==='GET')return new NextResponse(recordingPoster(req.nextUrl.searchParams.get('product')||''),{headers:{...headers,'Content-Type':'image/jpeg','X-Frame-Options':'DENY'}});
    if(action==='recording-video'&&req.method==='GET')return new NextResponse(null,{headers:{...headers,'Content-Type':'video/mp4','X-Accel-Redirect':recordingVideo(req.nextUrl.searchParams.get('product')||'')}});
    if(action==='content-image' && req.method==='POST'){
      const limit=8*1024*1024;if(Number(req.headers.get('content-length'))>limit)throw new CommerceError(413,'Изображение больше 8 МБ.');
      const reader=req.body?.getReader();if(!reader)throw new CommerceError(400,'Выберите изображение.');
      const chunks:Uint8Array[]=[];let size=0;
      while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit){await reader.cancel();throw new CommerceError(413,'Изображение больше 8 МБ.');}chunks.push(chunk.value);}
      return NextResponse.json({url:storeImage(Buffer.concat(chunks))},{headers});
    }
    if (action === 'content' && req.method === 'GET') {
      const slug=req.nextUrl.searchParams.get('slug');
      return NextResponse.json(slug?contentPage(slug):{pages:mirrorPages(),submissions:submissions()},{headers});
    }
    let data: Record<string, unknown> = {};
    if (req.method === 'POST') {
      const limit=action==='content'?2*1024*1024:action==='recording-details'?65536:16384;
      if (Number(req.headers.get('content-length')) > limit) throw new CommerceError(413, 'Слишком большой запрос.');
      const body = await req.text(); if (body.length > limit) throw new CommerceError(413, 'Слишком большой запрос.');
      try { data = JSON.parse(body); } catch { throw new CommerceError(400, 'Некорректный запрос.'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CommerceError(400, 'Некорректный запрос.');
    }
    if (action === 'login' && req.method === 'POST') {
      const token = login(data.password); const response = NextResponse.json({ ok: true }, { headers });
      response.cookies.set(adminCookie, token, { httpOnly: true, secure: config().origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: 8 * 3600 }); return response;
    }
    if (action === 'password' && req.method === 'POST') {
      rateLimit('admin-password:' + (req.headers.get('x-real-ip') || 'unknown'));
      const token = changePassword(data.current, data.replacement);
      const response = NextResponse.json({ ok: true }, { headers });
      response.cookies.set(adminCookie, token, { httpOnly: true, secure: config().origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: 8 * 3600 }); return response;
    }
    if (action === 'logout' && req.method === 'POST') {
      const response = NextResponse.json({ ok: true }, { headers }); response.cookies.set(adminCookie, '', { path: '/', maxAge: 0, httpOnly: true, secure: config().origin.startsWith('https:'), sameSite: 'strict' }); return response;
    }
    if (action === 'settings' && req.method === 'GET') return NextResponse.json(adminState(), { headers });
    if (action === 'recordings' && req.method === 'GET') return NextResponse.json(recordingImports(), {headers});
    if (action === 'recordings' && req.method === 'POST') return NextResponse.json(saveRecordingImport(data), {headers});
    if(action==='recording-details'&&req.method==='POST'){saveLectureDetails(data);return NextResponse.json(recordingImports(),{headers});}
    if (action === 'settings' && req.method === 'POST') return NextResponse.json(saveAdmin(data), { headers });
    if (action === 'content' && req.method === 'POST') return NextResponse.json(saveContent(data), { headers });
    throw new CommerceError(404, 'Раздел не найден.');
  } catch (e) {
    return NextResponse.json({ error: e instanceof CommerceError ? e.message : 'Не удалось выполнить действие.' }, { status: e instanceof CommerceError ? e.status : 500, headers });
  }
}
export const GET = handle;
export const POST = handle;
