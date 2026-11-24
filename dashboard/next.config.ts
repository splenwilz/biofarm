import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The sign-in page is public; no need to name the framework in every response.
  poweredByHeader: false,
  // Browser hardening for every response (Next's headers reference). DENY
  // means the dashboard cannot be framed by another site: a framed sign-in
  // page is the setup for clickjacking. Change to SAMEORIGIN only if the
  // dashboard is ever meant to be embedded. HSTS has no `preload` flag on
  // purpose: that is a browser-list commitment, not a header.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
