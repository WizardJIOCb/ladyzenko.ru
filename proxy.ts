import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { noindex, privatePath } from './lib/seo';

export function proxy(request:NextRequest) {
  let origin='https://new.ladyzenko.ru';
  try { origin=JSON.parse(fs.readFileSync(path.join(process.env.COMMERCE_STATE||path.join(process.cwd(),'.commerce'),'config.json'),'utf8')).origin||origin; } catch { /* Safe staging default. */ }
  const pathname=request.nextUrl.pathname;
  const host=request.headers.get('host')||request.nextUrl.host;
  // Existing personal links and payment webhooks keep their original host/cookies.
  if(origin==='https://ladyzenko.ru' && host.split(':')[0]==='new.ladyzenko.ru' && ['GET','HEAD'].includes(request.method) && !privatePath(pathname) && request.nextUrl.searchParams.get('preview')!=='1') {
    return NextResponse.redirect(new URL(pathname+request.nextUrl.search,origin),308);
  }
  const headers=new Headers(request.headers);
  headers.set('x-site-path',pathname);headers.set('x-site-host',host);
  const response=NextResponse.next({request:{headers}});
  if(noindex(origin,pathname,host)||request.nextUrl.searchParams.get('preview')==='1')response.headers.set('X-Robots-Tag','noindex, follow');
  if(privatePath(pathname))response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
export const config={matcher:['/((?!_next/|mirror-assets/|stuff/|.*\\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|mp4)$).*)']};
