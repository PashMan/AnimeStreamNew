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

  // 1. Извлекаем и нормализуем ссылку на AniBoom
  let targetUrl = urlParam || fallbackUrl;
  try {
    targetUrl = decodeURIComponent(targetUrl);
  } catch (_) {}

  if (targetUrl.includes('aniboom')) {
    try {
      const parsed = new URL(targetUrl.startsWith('//') ? `https:${targetUrl}` : targetUrl);
      const parentUrl = parsed.searchParams.get('parent') || 'https://animego.me/';

      // Запрос к AniBoom с полным набором браузерных заголовков
      const res = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': parentUrl,
          'Origin': new URL(parentUrl).origin,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        }
      });

      const html = await res.text();
      const match = html.match(/data-parameters="([^"]+)"/) || html.match(/data-parameters='([^']+)'/);

      if (match) {
        const decoded = JSON.parse(
          match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
        );

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
          
          // CDN2 Handshake for AniBoom session initialization
          try {
            const videoHash = decoded.id || decoded.hash || (hlsSrc.match(/\/([a-f0-9]{32,64})/i)?.[1]);
            const cdn2Url = videoHash ? `https://aniboom.one/cdn2/${videoHash}` : 'https://aniboom.one/';
            await fetch(cdn2Url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://aniboom.one/',
                'Origin': 'https://aniboom.one'
              }
            }).catch(() => {});
          } catch (_) {}

          if (resolveOnly) {
            return new Response(JSON.stringify({
              success: true,
              streamType: 'hls',
              url: `/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}&referer=${encodeURIComponent('https://aniboom.one/')}`,
              direct_url: hlsSrc
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }

          return Response.redirect(`/api/proxy-4k?url=${encodeURIComponent(hlsSrc)}&referer=${encodeURIComponent('https://aniboom.one/')}`, 302);
        }
      }
      throw new Error('data-parameters not found');
    } catch (err: any) {
      console.warn(`[AniBoom Error]: ${err.message}`);
    }
  }

  // 2. Если AniBoom не отдал поток — возвращаем понятный JSON для клиента, а не 500 ошибку
  return new Response(JSON.stringify({ 
    error: 'aniboom_stream_unavailable',
    fallback_url: fallbackUrl 
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
