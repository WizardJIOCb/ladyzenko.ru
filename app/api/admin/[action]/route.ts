import { NextRequest, NextResponse } from 'next/server';
import { adminAuthorized, adminCookie, adminState, login, saveAdmin, changePassword } from '@/lib/admin';
import { CommerceError, config, rateLimit } from '@/lib/commerce';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' };
async function handle(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await ctx.params;
    if (req.method === 'POST' && req.headers.get('origin') !== config().origin) throw new CommerceError(403, 'Обновите страницу админки.');
    if (req.method === 'POST' && action === 'login') rateLimit('admin-login:' + (req.headers.get('x-real-ip') || 'unknown'));
    const authenticated = adminAuthorized(req.cookies.get(adminCookie)?.value || '');
    if (action !== 'login' && !authenticated) throw new CommerceError(401, 'Войдите в админку.');
    let data: Record<string, unknown> = {};
    if (req.method === 'POST') {
      if (Number(req.headers.get('content-length')) > 16384) throw new CommerceError(413, 'Слишком большой запрос.');
      const body = await req.text(); if (body.length > 16384) throw new CommerceError(413, 'Слишком большой запрос.');
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
    if (action === 'settings' && req.method === 'POST') return NextResponse.json(saveAdmin(data), { headers });
    throw new CommerceError(404, 'Раздел не найден.');
  } catch (e) {
    return NextResponse.json({ error: e instanceof CommerceError ? e.message : 'Не удалось выполнить действие.' }, { status: e instanceof CommerceError ? e.status : 500, headers });
  }
}
export const GET = handle;
export const POST = handle;
