import {recordingPoster} from '@/lib/recording-media';
import {CommerceError} from '@/lib/commerce';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  const headers={'Cache-Control':'public, max-age=300','Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex','Referrer-Policy':'no-referrer'};
  try{const {id}=await params;return new Response(new Uint8Array(recordingPoster(id)),{headers});}
  catch(e){return new Response(null,{status:e instanceof CommerceError?e.status:500,headers:{...headers,'Cache-Control':'no-store'}});}
}
