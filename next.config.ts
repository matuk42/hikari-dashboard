import type { NextConfig } from "next";

// Content-Security-Policy. The app talks to Supabase over REST (https) and
// realtime (wss), and logs in via Google OAuth — all must be in connect-src,
// otherwise the browser blocks them with "violates connect-src 'self'".
// Inline styles are used throughout (style={{…}}) and Next injects inline
// bootstrap scripts, so 'unsafe-inline' is required for this single-user app.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: csp }],
      },
    ]
  },
};

export default nextConfig;
