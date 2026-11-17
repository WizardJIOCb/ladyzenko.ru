import fs from 'node:fs';
import path from 'node:path';
import { stateDir } from '@/lib/commerce';
export const dynamic='force-dynamic';
export function GET(){
  try{const key=fs.readFileSync(path.join(stateDir(),'seo','indexnow-key'),'utf8').trim();if(!/^[a-f0-9]{64}$/.test(key))throw new Error();return new Response(key,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}catch{return new Response('Not configured',{status:404});}
}
