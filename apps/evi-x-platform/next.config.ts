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
    return { beforeFiles: [], afterFiles: [{ source: "/api/:path*", destination: `${parsed.origin}/api/:path*` }], fallback: [] };
  },
};

export default nextConfig;
