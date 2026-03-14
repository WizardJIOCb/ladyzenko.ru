import type { NextConfig } from "next";
import { getLegacyRedirects } from "./lib/content";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async redirects() {
    const redirects = getLegacyRedirects();
    return [
      {
        source: "/new",
        destination: "/",
        permanent: true,
      },
      ...redirects.map((redirect) => ({
        source: redirect.source,
        destination: redirect.destination,
        permanent: true,
      })),
    ];
  },
};

export default nextConfig;
