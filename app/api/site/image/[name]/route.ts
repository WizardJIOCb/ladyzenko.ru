import { readImage } from '@/lib/mirror';
import { CommerceError } from '@/lib/commerce';
export const dynamic='force-dynamic';
export async function GET(_req:Request,ctx:{params:Promise<{name:string}>}){try{const {name}=await ctx.params;const image=readImage(name);return new Response(new Uint8Array(image.bytes),{headers:{'Content-Type':image.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});}catch(e){return new Response('Изображение не найдено.',{status:e instanceof CommerceError?e.status:500});}}
