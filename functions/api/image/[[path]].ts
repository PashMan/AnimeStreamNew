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

  if (response && response.ok) {
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

    // 3. Fallback to desu.shikimori.one
    if (!fetchResponse.ok) {
      try {
        const desuResponse = await fetch(`https://desu.shikimori.one${path}${url.search}`, { headers });
        if (desuResponse.ok) {
          const newHeaders = new Headers(desuResponse.headers);
          newHeaders.set('Access-Control-Allow-Origin', '*');
          newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
          response = new Response(desuResponse.body, { status: 200, headers: newHeaders });
          context.waitUntil(cache.put(cacheKey, response.clone()));
          return response;
        }
      } catch (_) {}
    }

    // 4. Fallback to Kodik search for poster
    const animeIdMatch = path.match(/\/(\d+)\.(jpg|png|webp|jpeg)$/);
    if (animeIdMatch) {
      const animeId = animeIdMatch[1];
      try {
        const kodikRes = await fetch(`https://kodikapi.com/search?token=e3189966144beaa4a54c600125c1109a&shikimori_id=${animeId}&with_material_data=true`);
        if (kodikRes.ok) {
          const kData: any = await kodikRes.json();
          const poster = kData?.results?.[0]?.material_data?.poster_url || kData?.results?.[0]?.material_data?.anime_photos?.[0];
          if (poster) {
            const pUrl = poster.startsWith('//') ? `https:${poster}` : poster;
            const pRes = await fetch(pUrl);
            if (pRes.ok) {
              const newHeaders = new Headers(pRes.headers);
              newHeaders.set('Access-Control-Allow-Origin', '*');
              newHeaders.set('Cache-Control', 'public, max-age=2592000, s-maxage=2592000');
              response = new Response(pRes.body, { status: 200, headers: newHeaders });
              context.waitUntil(cache.put(cacheKey, response.clone()));
              return response;
            }
          }
        }
      } catch (_) {}

      // 5. Fallback to Jikan API
      try {
        const jikanRes = await fetch(`https://api.jikan.moe/v4/anime/${animeId}`);
        if (jikanRes.ok) {
          const jikanData: any = await jikanRes.json();
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
                status: 200,
                headers: newHeaders,
              });
              
              context.waitUntil(cache.put(cacheKey, response.clone()));
              return response;
            }
          }
        }
      } catch (err) {
        console.error("Jikan fallback error:", err);
      }
    }

    // 6. If no image found anywhere, return a clean SVG placeholder image (200 OK) so browser displays nicely without broken image icon
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#0f172a"/><path d="M250 400 L350 400 L300 330 Z" fill="#334155"/><circle cx="300" cy="450" r="30" fill="#334155"/><text x="300" y="530" font-family="sans-serif" font-size="24" font-weight="600" fill="#64748b" text-anchor="middle">KamiAnime</text><text x="300" y="565" font-family="sans-serif" font-size="16" fill="#475569" text-anchor="middle">Обложка скоро появится</text></svg>`;
    return new Response(fallbackSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
