// functions/api/media/playlist.ts

export async function onRequest(context: any) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  const urlObj = new URL(request.url);
  let urlParam = urlObj.searchParams.get('url') || '';
  const fallbackUrl = urlObj.searchParams.get('fallback_url') || '';
  const resolveOnly = urlObj.searchParams.get('resolve') === 'true';

  if (!urlParam && !fallbackUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  let targetUrl = urlParam || fallbackUrl;
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (_) {}

  if (targetUrl.includes('aniboom')) {
    try {
      const parsed = new URL(targetUrl.startsWith('//') ? `https:${targetUrl}` : targetUrl);
      
      // 1. Берем оригинальный parent из ссылки (не перезаписываем голым доменом!)
      let parentUrl = parsed.searchParams.get('parent') || 'https://animego.me/';
      try { parentUrl = decodeURIComponent(parentUrl); } catch (_) {}
      if (!parentUrl.startsWith('http')) parentUrl = 'https://animego.me/';

      // 2. Запрос к AniBoom с точным Referer
      const res = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': parentUrl,
          'Origin': new URL(parentUrl).origin,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        }
      });

      if (res.ok) {
        const html = await res.text();
        const match = html.match(/data-parameters="([^"]+)"/) || html.match(/data-parameters='([^']+)'/);

        if (match) {
          const rawParams = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'");
          const decoded = JSON.parse(rawParams);

          let hlsSrc = '';
          if (decoded.hls) {
            const hlsObj = typeof decoded.hls === 'string' ? JSON.parse(decoded.hls) : decoded.hls;
            hlsSrc = hlsObj['1080'] || hlsObj['720'] || hlsObj.src || hlsObj.url || (typeof hlsObj === 'string' ? hlsObj : '');
          }

          if (!hlsSrc && decoded.dash) {
            const dashObj = typeof decoded.dash === 'string' ? JSON.parse(decoded.dash) : decoded.dash;
            hlsSrc = dashObj['1080'] || dashObj['720'] || dashObj.src || dashObj.url || '';
          }

          if (hlsSrc) {
            if (hlsSrc.startsWith('//')) hlsSrc = `https:${hlsSrc}`;
            
            // 3. CDN2 Handshake (авторизация токена)
            const videoHash = decoded.id || decoded.hash || (hlsSrc.match(/\/([a-f0-9]{32,64})/i)?.[1]);
            if (videoHash) {
              try {
                await fetch(`https://aniboom.one/cdn2/${videoHash}`, {
                  method: 'POST',
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': parsed.toString(),
                    'Origin': 'https://aniboom.one'
                  }
                });
              } catch (_) {}
            }

            const proxyStreamUrl = `/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}&referer=${encodeURIComponent('https://aniboom.one/')}`;

            if (resolveOnly) {
              return new Response(JSON.stringify({
                success: true,
                streamType: 'hls',
                qualities: [1080, 720, 480, 360],
                quality: 1080,
                direct_url: hlsSrc,
                url: proxyStreamUrl
              }), {
                status: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
              });
            }

            return Response.redirect(proxyStreamUrl, 302);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[AniBoom Error]: ${err.message}`);
    }
  }

  // 4. Мягкий ответ вместо 502 ошибки
  return new Response(JSON.stringify({ 
    error: 'aniboom_stream_unavailable',
    fallback_url: fallbackUrl 
  }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}