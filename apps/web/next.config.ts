import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdfjs-dist",
    "pdfkit",
    "tesseract.js",
    "pdf-to-img",
    "@neslinesli93/qpdf-wasm",
  ],
  // Vendored copy only — never trace pdf.worker from node_modules (Bun symlinks break Vercel deploy).
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": [
      "./src/server/legacy/pay-credit-cards/vendor/pdf.worker.mjs",
      "./src/server/legacy/pay-credit-cards/vendor/qpdf.wasm",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
    ],
    "/api/soa/pdf": [
      "./src/server/legacy/pay-credit-cards/vendor/pdf.worker.mjs",
      "./src/server/legacy/pay-credit-cards/vendor/qpdf.wasm",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
      const externals = config.externals;
      config.externals = [
        ...(Array.isArray(externals) ? externals : [externals]),
        "@neslinesli93/qpdf-wasm",
        (
          { request }: { request?: string },
          callback: (err?: Error | null, result?: string) => void,
        ) => {
          if (request?.endsWith(".wasm")) {
            callback(null, `commonjs ${request}`);
            return;
          }
          callback();
        },
      ];
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/api/soa/pdf",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
      {
        source: "/((?!api/soa/pdf).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
