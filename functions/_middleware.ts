import { scheduled as telegramScheduled } from './cron/telegram-worker';

export const scheduled = async (event: any, env: any, ctx: any) => {
  await telegramScheduled(event, env, ctx);
};

export async function onRequest(context: any) {
  const { request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. Missing static asset protection:
  // If request is for an asset, script, or stylesheet, and static serving produced a text/html fallback (meaning the file was deleted/stale)
  if (
    pathname.startsWith('/assets/') ||
    /\.(js|mjs|cjs|ts|tsx|jsx|css|map|wasm|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot|xml|txt)$/i.test(pathname)
  ) {
    const response = await next();
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return new Response('Asset Not Found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
    return response;
  }

  // 2. HTML navigation routes - prevent edge and browser caching of index.html
  const response = await next();
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    newHeaders.set('Pragma', 'no-cache');
    newHeaders.set('Expires', '0');
    newHeaders.set('Surrogate-Control', 'no-store');
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  }

  return response;
}
