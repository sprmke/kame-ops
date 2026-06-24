import path from "path";
import type { NextConfig } from "next";

/** Monorepo root — file tracing must include hoisted node_modules native assets. */
const repoRoot = path.join(__dirname, "../..");

/** Vendored copies only — never trace node_modules (Bun .bun symlinks break Vercel packaging). */
const nativeTraceGlobs = [
  "./src/server/lib/native/pdf.worker.mjs",
  "./src/server/lib/native/qpdf.wasm",
  "./src/server/lib/native/canvas.linux-x64-gnu.node",
];

const traceExcludeGlobs = [
  "**/node_modules/.bun/**",
  "./src/server/legacy/data/downloads/**",
  "./src/server/legacy/data/output/**",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdfjs-dist",
    "pdfkit",
    "tesseract.js",
    "pdf-to-img",
    "@neslinesli93/qpdf-wasm",
  ],
  outputFileTracingIncludes: {
    "/api/trpc/[trpc]": nativeTraceGlobs,
    "/api/soa/pdf": nativeTraceGlobs,
    "/api/health/engines": nativeTraceGlobs,
  },
  outputFileTracingExcludes: {
    "/api/trpc/[trpc]": traceExcludeGlobs,
    "/api/soa/pdf": traceExcludeGlobs,
    "/api/health/engines": traceExcludeGlobs,
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
