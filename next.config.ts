import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

// Next.js App Router requires unsafe-inline for hydration scripts in all environments.
// unsafe-eval is only needed by the dev server (hot reload).
// Proper elimination of unsafe-inline requires nonce-based CSP — tracked for a future iteration.
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
  // Isolates the browsing context from cross-origin windows opened by this page
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Tells browsers not to share this page's opener reference cross-origin
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // HSTS: enforce HTTPS for 1 year, include subdomains
  // (Vercel also adds this automatically; safe to declare explicitly)
  ...(!isDev ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://openweathermap.org https://maps.googleapis.com https://lh3.googleusercontent.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
