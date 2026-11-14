/** Boundaries shared by the Cloudflare preview Worker and its runtime tests. */
export type PreviewHandler<Environment, Context> = {
  fetch(request: Request, env: Environment, context: Context): Response | Promise<Response>;
};

type PreviewAssets = {
  ASSETS?: { fetch(request: Request): Response | Promise<Response> };
};

const LOCAL_API_PATHS = new Set([
  '/api/cases',
  '/api/rules',
  '/api/diagnose',
  '/api/control-contract',
  '/api/agent/brain',
  '/api/agent/image-gen',
]);

function localApiPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '');
  return LOCAL_API_PATHS.has(path) || /^\/api\/cases\/[^/%]+$/.test(path);
}

function securityHeaders(response: Response, pathname: string): Response {
  const secured = new Response(response.body, response);
  secured.headers.set('X-EviX-Deployment-Scope', 'frontend-preview');
  secured.headers.set('X-Content-Type-Options', 'nosniff');
  secured.headers.set('X-Frame-Options', 'DENY');
  secured.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  secured.headers.set('Referrer-Policy', 'same-origin');
  secured.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=()');
  secured.headers.set('Content-Security-Policy', pathname.startsWith('/knowledge-assets/')
    ? "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'"
    : "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
  secured.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return secured;
}

/** No backend or provider request is made for a refused preview API route. */
export function createCloudflarePreview<Environment extends PreviewAssets, Context>(handler: PreviewHandler<Environment, Context>): PreviewHandler<Environment, Context> {
  return {
    async fetch(request, env, context) {
      const pathname = new URL(request.url).pathname;
      let decodedPath: string;
      try {
        decodedPath = decodeURIComponent(pathname).replaceAll('\\', '/').replace(/\/+/g, '/');
      } catch {
        return securityHeaders(Response.json({ error: { code: 'invalid_path', message: '请求路径无效。' } }, { status: 400 }), pathname);
      }
      const isApi = decodedPath === '/api' || decodedPath.startsWith('/api/');
      if (isApi && (pathname !== decodedPath || !localApiPath(pathname))) {
        return securityHeaders(Response.json({
          error: {
            code: 'preview_backend_unavailable',
            message: '当前为前端预览，账号、项目保存和模型调用尚未连接后端服务。',
          },
          deploymentScope: 'frontend-preview',
        }, { status: 503, headers: { 'Cache-Control': 'no-store' } }), pathname);
      }
      // run_worker_first sends compiled CSS/JS here too. vinext only falls
      // back to ASSETS for declared public files, not its generated bundles.
      if (pathname === decodedPath && pathname.startsWith('/_next/static/') && env.ASSETS) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return securityHeaders(new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } }), pathname);
        }
        return securityHeaders(await env.ASSETS.fetch(request), pathname);
      }
      return securityHeaders(await handler.fetch(request, env, context), pathname);
    },
  };
}
