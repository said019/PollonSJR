/** @type {import('next').NextConfig} */

// Headers de seguridad. Deliberadamente NO ponemos una CSP estricta con
// script-src restringido: rompería el runtime inline de Next.js, Google
// Maps y el SDK de Mercado Pago, y tirar el sitio en prod es peor que el
// riesgo que mitiga. Sí aplicamos las defensas de bajo riesgo / alto valor:
// clickjacking, MIME sniffing, HTTPS forzado, referrer y permisos.
const securityHeaders = [
  // Clickjacking: nadie puede embeber el sitio en un iframe.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
  // No adivinar el Content-Type (defensa XSS por upload).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Forzar HTTPS 2 años incl. subdominios (Railway ya es HTTPS).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // No filtrar la URL completa a terceros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Sólo el propio sitio puede pedir geolocalización (la app del
  // repartidor la necesita); cámara y micrófono bloqueados.
  {
    key: "Permissions-Policy",
    value: "geolocation=(self), camera=(), microphone=(), interest-cohort=()",
  },
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@pollon/types", "@pollon/utils"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
