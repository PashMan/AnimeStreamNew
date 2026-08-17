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

  const path = url.pathname.replace(/^\/api\/image/, '');
  const targetUrl = `https://shikimori.one${path}${url.search}`;

  // 1. Check Cloudflare Cache first
  const cache = caches.default;
  // Use a clean Request object for the cache key to ignore user-specific headers like Cookies or User-Agent
  const cacheKey = new Request(url.toString(), { method: 'GET' });
  let response = await cache.match(cacheKey);

  if (response) {
    // Return cached response immediately with a custom header
    const cachedResponse = new Response(response.body, response);
    cachedResponse.headers.set('X-Image-Cache', 'HIT');
    return cachedResponse;
  }

  // 2. If not in cache, fetch from Shikimori
  const headers = new Headers();
  headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  headers.set('Referer', 'https://shikimori.one/');
  headers.set('Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');

  try {
    const fetchResponse = await fetch(targetUrl, {
      method: context.request.method,
      headers: headers,
    });

    // Only cache successful image responses
    if (fetchResponse.ok) {
      const newHeaders = new Headers(fetchResponse.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      
      // Cache for 30 days (2592000 seconds) in browser AND Cloudflare CDN
      newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
      
      newHeaders.delete('Content-Security-Policy');
      newHeaders.delete('X-Frame-Options');
      newHeaders.delete('Vary');
      newHeaders.delete('Set-Cookie');

      response = new Response(fetchResponse.body, {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: newHeaders,
      });

      // 3. Store in Cloudflare Cache asynchronously
      context.waitUntil(cache.put(cacheKey, response.clone()));
      
      const missResponse = new Response(response.body, response);
      missResponse.headers.set('X-Image-Cache', 'MISS');
      return missResponse;
    }

    // Fallback to Jikan API if Shikimori returns error (404, 403, etc.)
    const animeIdMatch = path.match(/\/(\d+)\.jpg$/);
    if (animeIdMatch) {
      const animeId = animeIdMatch[1];
      try {
        const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
        if (jikanRes.ok) {
          const jikanData = await jikanRes.json();
          const imageUrl = jikanData?.data?.images?.jpg?.large_image_url || jikanData?.data?.images?.jpg?.image_url;
          if (imageUrl) {
            const fallbackImageRes = await fetch(imageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
              }
            });
            if (fallbackImageRes.ok) {
              const newHeaders = new Headers(fallbackImageRes.headers);
              newHeaders.set('Access-Control-Allow-Origin', '*');
              newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
              
              response = new Response(fallbackImageRes.body, {
                status: fallbackImageRes.status,
                statusText: fallbackImageRes.statusText,
                headers: newHeaders,
              });
              
              context.waitUntil(cache.put(cacheKey, response.clone()));
              
              const missResponse = new Response(response.body, response);
              missResponse.headers.set('X-Image-Cache', 'JIKAN-FALLBACK');
              return missResponse;
            }
          }
        }
      } catch (err) {
        console.error("Jikan fallback error:", err);
      }
    }

    // If Shikimori returned an error (like 404 or 429), don't cache it for long
    return new Response(fetchResponse.body, {
      status: fetchResponse.status,
      statusText: fetchResponse.statusText,
      headers: { 'Cache-Control': 'public, max-age=60' } // Cache errors for only 1 minute
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
