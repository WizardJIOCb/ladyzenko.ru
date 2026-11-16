import { NextRequest } from 'next/server';
import { GET as render } from '../route';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,ctx:{params:Promise<{slug:string}>}) {
  const {slug}=await ctx.params;
  // Path parameters survive Next.js rewrites; injected query parameters may not.
  const url=req.nextUrl.clone();url.searchParams.set('slug',slug);
  return render(new NextRequest(url,{headers:req.headers}));
}
