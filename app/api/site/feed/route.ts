import { NextRequest,NextResponse } from 'next/server';
import { localFeed } from '@/lib/mirror';
import { CommerceError } from '@/lib/commerce';
export const dynamic='force-dynamic';
export function GET(req:NextRequest){try{return NextResponse.json(localFeed(req.nextUrl.searchParams),{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:'Публикация не найдена.'},{status:e instanceof CommerceError?e.status:500});}}
