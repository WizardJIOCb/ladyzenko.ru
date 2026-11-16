import type { NextConfig } from "next";
import { getLegacyRedirects } from "./lib/content";
import path from "node:path";
import fs from "node:fs";

const manifestPath = path.join(process.cwd(), 'mirror/manifest.json');
const mirror = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {slug:string;path:string}[] : [];
const mirrorPaths = new Set(mirror.map(p => p.path));
const routes = new Map(mirror.map(p => [p.path,p.slug]));
for (const item of getLegacyRedirects()) {
  const slug = routes.get(item.source);
  if (slug && !routes.has(item.destination)) routes.set(item.destination,slug);
}

const nextConfig: NextConfig = {
  turbopack: { root: path.resolve(process.cwd()) },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [{ source: '/admin/:path*', headers: [
      { key: 'Cache-Control', value: 'private, no-store' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
  async redirects() {
    const redirects = getLegacyRedirects().filter(r => !mirrorPaths.has(r.source));
    return [
      ...(!mirrorPaths.has('/new') ? [{
        source: "/new",
        destination: "/",
        permanent: true,
      }] : []),
      ...redirects.map((redirect) => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    return {beforeFiles:[...routes].map(([source,slug])=>({source,destination:'/api/site/page/'+slug})),afterFiles:[],fallback:[]};
  },
};

export default nextConfig;
