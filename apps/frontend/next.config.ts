import type { NextConfig } from "next";
import path from "node:path";

const apiOrigin = process.env.EVIX_API_ORIGIN ?? "http://127.0.0.1:8180";
const parsed = new URL(apiOrigin);
if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
  throw new Error("EVIX_API_ORIGIN must be an operator-configured HTTP origin");
}
const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  transpilePackages: ["@evix/shared"],
  async headers() {
    return [{ source: "/knowledge-assets/:path*", headers: [
      { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
    ] }];
  },
  webpack(config, { isServer, webpack }) {
    // PptxGenJS conditionally imports Node-only I/O in its browser-capable ESM
    // export. Its package already marks these modules false for browsers;
    // handle the node: scheme before Webpack's resource reader runs.
    if (!isServer) config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:(?:fs(?:\/promises)?|https)$/ }));
    return config;
  },
  async rewrites() {
    // Stateless corpus/rule/diagnosis handlers remain local during P0.
    // Every hosted identity, project, model and version request goes to FastAPI.
    // afterFiles runs before dynamic app routes. Keep case detail reads in the
    // same local corpus as the case list, while hosted requests still use FastAPI.
    return { beforeFiles: [], afterFiles: [{ source: "/api/:path((?!cases(?:/|$)).*)", destination: `${parsed.origin}/api/:path` }], fallback: [] };
  },
};

export default nextConfig;
