import type { NextConfig } from "next";

const backendOrigin = process.env.ORVIA_BACKEND_URL || "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
