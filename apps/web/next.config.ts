import path from "path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "../..");

/** Vendored native files only — do not trace node_modules (Bun .bun symlinks break Vercel). */
const nativeTraceGlobs = [
  "./src/server/lib/native/qpdf.wasm",
  "./src/server/lib/native/canvas.linux-x64-gnu.node",
];

const traceExcludeGlobs = ["**/node_modules/.bun/**"];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  outputFileTracingRoot: repoRoot,
  serverExternalPackages: [
    "@napi-rs/canvas",
    "pdfjs-dist",
    "pdfkit",
    "tesseract.js",
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
      config.externals = [
        ...(Array.isArray(config.externals)
          ? config.externals
          : [config.externals]),
        "@neslinesli93/qpdf-wasm",
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
