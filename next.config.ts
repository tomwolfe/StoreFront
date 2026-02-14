import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/admin/:path*",
        destination: `${process.env.TABLESTACK_URL || "http://localhost:3001"}/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
