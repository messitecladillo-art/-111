import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';
import vinext from 'vinext';

// A separate preview target preserves the standard Next.js build. In
// particular, do not load next.config.ts's hosted API rewrite to localhost.
export default defineConfig({
  build: { minify: 'oxc', sourcemap: false },
  // Vite leaves server environments unminified by default. Minify the
  // uploaded server module graph as well as the public browser assets.
  environments: {
    rsc: { build: { minify: 'oxc', sourcemap: false } },
    ssr: { build: { minify: 'oxc', sourcemap: false } },
  },
  plugins: [
    vinext({
      nextConfig: {
        transpilePackages: ['@evix/shared'],
        productionBrowserSourceMaps: false,
        poweredByHeader: false,
        async rewrites() {
          return { beforeFiles: [], afterFiles: [], fallback: [] };
        },
      },
    }),
    cloudflare({
      configPath: 'wrangler.cloudflare.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      persistState: false,
    }),
  ],
});
