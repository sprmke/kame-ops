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
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": [
      "./src/server/legacy/pay-credit-cards/vendor/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
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
