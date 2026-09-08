import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // Allow the Flutter app (web/desktop on a different origin/port, or the
  // mobile client) to call the mobile API cross-origin. The Authorization
  // header is required for the authenticated endpoints.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
