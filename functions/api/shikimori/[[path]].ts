export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  
  // Handle CORS preflight requests
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const path = url.pathname.replace(/^\/api\/shikimori/, '');
  const authHeader = context.request.headers.get('Authorization');
  const isGetRequest = context.request.method === 'GET';
  const canCache = isGetRequest && !authHeader;

  // 1. Check Cloudflare Cache first for public GET requests
  const cache = (caches as any)?.default;
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  
  if (canCache && cache) {
    try {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse && cachedResponse.ok) {
        return cachedResponse;
      }
    } catch (_) {}
  }

  const headers = new Headers();
  headers.set('User-Agent', 'KamiAnime-Web/2.5 (client: web-browser; contact: admin@kamianime.club)');
  headers.set('Referer', 'https://shikimori.one/');
  headers.set('Accept', 'application/json, text/plain, */*');
  
  if (authHeader) {
    headers.set('Authorization', authHeader);
  }

  const init: RequestInit = {
    method: context.request.method,
    headers: headers,
  };

  if (!isGetRequest && context.request.method !== 'HEAD') {
    init.body = context.request.body;
    const contentType = context.request.headers.get('Content-Type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }
  }

  // Mirrors to try in sequence
  const mirrors = [
    `https://shikimori.one/api${path}${url.search}`,
    `https://shikimori.io/api${path}${url.search}`,
    `https://desu.shikimori.one/api${path}${url.search}`
  ];

  let lastResponse: Response | null = null;

  for (const targetUrl of mirrors) {
    try {
      const response = await fetch(targetUrl, {
        ...init,
        signal: AbortSignal.timeout(4000)
      });

      if (response.ok) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', '*');
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', '*');
        newHeaders.delete('Content-Security-Policy');
        newHeaders.delete('X-Frame-Options');
        newHeaders.delete('Vary');
        newHeaders.delete('Set-Cookie');

        if (canCache) {
          // Cache successful response for 30 minutes on edge, 5 min in browser
          newHeaders.set('Cache-Control', 'public, max-age=300, s-maxage=1800');
        }

        const finalResponse = new Response(response.body, {
          status: 200,
          statusText: 'OK',
          headers: newHeaders,
        });

        if (canCache && cache && context.waitUntil) {
          context.waitUntil(cache.put(cacheKey, finalResponse.clone()));
        }

        return finalResponse;
      }

      lastResponse = response;
      // If 404/422, don't try other mirrors as item definitely doesn't exist
      if (response.status === 404 || response.status === 422) {
        break;
      }
    } catch (_) {
      // Continue to next mirror
    }
  }

  // Graceful fallbacks for common public GET endpoints if Shikimori rate-limits or is down
  if (isGetRequest) {
    if (path.startsWith('/calendar') || path.startsWith('/topics')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60'
        }
      });
    }

    if (path.startsWith('/animes')) {
      // Return empty array gracefully with 200 status so client can fallback to local cache or Kodik
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=30'
        }
      });
    }
  }

  if (lastResponse) {
    const errorHeaders = new Headers(lastResponse.headers);
    errorHeaders.set('Access-Control-Allow-Origin', '*');
    return new Response(lastResponse.body, {
      status: lastResponse.status,
      headers: errorHeaders
    });
  }

  return new Response(JSON.stringify({ error: 'Shikimori upstream unavailable' }), { 
    status: 503,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    }
  });
};
