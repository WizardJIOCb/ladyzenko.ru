import { NextRequest, NextResponse } from 'next/server';
import { authorized, capability, checkout, CommerceError, config, mediaDelivery, order, publicOrder, reconcile, webhook, trustedOrigin } from '@/lib/commerce';
import { viewerCookie, viewerState, sendViewerCode, verifyViewerCode, startWatching, keepWatching, stopWatching, logoutViewer, canStream } from '@/lib/viewer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
function cookie(id: string, key: string) {
  return { name: 'order_' + id, value: key, httpOnly: true, secure: config().origin.startsWith('https:'),
    sameSite: 'lax' as const, path: '/api/commerce/orders/' + id, maxAge: 400 * 86400 };
}
async function handle(req: NextRequest, ctx: { params: Promise<{parts: string[]}> }) {
  try {
    const { parts } = await ctx.params;
    const c = config();
    const isWebhook = parts.join('/') === 'webhook';
    if (req.method === 'POST' && !isWebhook && !trustedOrigin(req.headers.get('origin'))) throw new CommerceError(403, 'Обновите страницу сайта.');
    let data: Record<string, any> = {};
    if (req.method === 'POST') {
      if (Number(req.headers.get('content-length')) > 16384) throw new CommerceError(413, 'Слишком большой запрос.');
      const text = await req.text(); if (text.length > 16384) throw new CommerceError(413, 'Слишком большой запрос.');
      try { data = JSON.parse(text); } catch { throw new CommerceError(400, 'Некорректный запрос.'); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CommerceError(400, 'Некорректный запрос.');
    }
    if (isWebhook && req.method === 'POST') { await webhook(data); return NextResponse.json({ok:true}, {headers}); }
    if (parts.join('/') === 'checkout' && req.method === 'POST') {
      const id = typeof data.requestId === 'string' && /^[a-f0-9]{32}$/.test(data.requestId) ? data.requestId : '';
      const before = id ? order(id) : undefined;
      let row;
      try { row = await checkout(data, req.headers.get('x-real-ip') || 'unknown', req.cookies.get('order_' + id)?.value || ''); }
      catch(error) {
        // Preserve ownership after an ambiguous provider POST, without allowing a public order ID to reclaim an existing order.
        const created = !before && id ? order(id) : undefined;
        if (created && created.product === data.product && created.email === String(data.email || '').trim().toLowerCase()) {
          const response = NextResponse.json({ error: error instanceof CommerceError ? error.message : 'Не удалось проверить оплату.', id }, {status: error instanceof CommerceError ? error.status : 500, headers});
          response.cookies.set(cookie(id, capability(id))); return response;
        }
        throw error;
      }
      const response = NextResponse.json({ id: row.id, confirmation: row.confirmation, status: row.status }, { headers });
      response.cookies.set(cookie(row.id, capability(row.id))); return response;
    }
    if (parts[0] === 'orders' && parts.length >= 2 && parts.length <= 3) {
      const id = parts[1];
      if (!/^[a-f0-9]{32}$/.test(id)) throw new CommerceError(404, 'Заказ не найден.');
      const key = req.cookies.get('order_' + id)?.value || '';
      if (parts[2] === 'access' && req.method === 'POST') {
        if (typeof data.key !== 'string' || !authorized(id, data.key) || !order(id)) throw new CommerceError(403, 'Ссылка заказа недействительна.');
        const response = NextResponse.json({ok:true}, {headers}); response.cookies.set(cookie(id, data.key)); return response;
      }
      if (!authorized(id, key)) throw new CommerceError(403, 'Откройте личную ссылку из письма или того браузера, где оформляли заказ.');
      const row = order(id); if (!row) throw new CommerceError(404, 'Заказ не найден.');
      const viewer=req.cookies.get(viewerCookie)?.value||'';
      const view=()=>({...publicOrder(order(id)!),viewer:viewerState(row,viewer)});
      if (parts[2]==='login-code' && req.method==='POST')return NextResponse.json(await sendViewerCode(row,req.headers.get('x-real-ip')||'unknown'),{headers});
      if (parts[2]==='verify-code' && req.method==='POST'){
        const token=verifyViewerCode(row,data.code,req.headers.get('x-real-ip')||'unknown');const response=NextResponse.json({ok:true},{headers});
        response.cookies.set(viewerCookie,token,{httpOnly:true,secure:config().origin.startsWith('https:'),sameSite:'strict',path:'/api/commerce',maxAge:30*86400});return response;
      }
      if(parts[2]==='watch'&&req.method==='POST'){
        const play=typeof data.play==='string'?data.play:'';
        return NextResponse.json(data.action==='heartbeat'?keepWatching(row,viewer,play):data.action==='stop'?stopWatching(viewer,play):startWatching(row,viewer,data.takeover===true),{headers});
      }
      if(parts[2]==='logout'&&req.method==='POST'){
        logoutViewer(viewer);const response=NextResponse.json({ok:true},{headers});response.cookies.set(viewerCookie,'',{path:'/api/commerce',httpOnly:true,secure:config().origin.startsWith('https:'),sameSite:'strict',maxAge:0});return response;
      }
      if (parts[2] === 'refresh' && req.method === 'POST') { await reconcile(id); return NextResponse.json(view(), {headers}); }
      if (parts[2] === 'media' && req.method === 'GET') {
        const view = publicOrder(row); const delivery = mediaDelivery(row.product);
        if (!view.canWatch || !delivery || !canStream(row,viewer,req.nextUrl.searchParams.get('play')||'')) throw new CommerceError(403, 'Для просмотра подтвердите почту и откройте плеер на странице заказа.');
        return new NextResponse(null, { headers: { ...headers, 'Content-Type': 'video/mp4', 'X-Accel-Redirect': delivery } });
      }
      if (parts.length === 2 && req.method === 'GET') return NextResponse.json(view(), {headers});
    }
    throw new CommerceError(404, 'Страница не найдена.');
  } catch (error) {
    return NextResponse.json({error: error instanceof CommerceError ? error.message : 'Не удалось выполнить запрос. Повторите позже.'},
      { status: error instanceof CommerceError ? error.status : 500, headers });
  }
}
export const GET = handle;
export const POST = handle;
