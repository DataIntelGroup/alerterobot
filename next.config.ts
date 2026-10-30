import type { NextConfig } from "next";

// En-têtes valables pour toutes les réponses. La CSP, qui porte un nonce par
// requête, est posée par src/proxy.ts.
const entetesSecurite = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const config: NextConfig = {
  poweredByHeader: false,
  // Pas de bouton d'outils de développement à l'écran : les erreurs restent signalées.
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: entetesSecurite },
      // Le service worker doit pouvoir être mis à jour sans cache.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default config;
