// functions/api/media/aniboom/resolve.ts

export async function onRequest(context: any) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      }
    });
  }

  const reqUrl = new URL(request.url);
  const embedUrl = reqUrl.searchParams.get('embed_url') || reqUrl.searchParams.get('url');

  if (!embedUrl) {
    return new Response(JSON.stringify({ success: false, error: 'embed_url is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    let cleanEmbed = decodeURIComponent(embedUrl);
    if (cleanEmbed.startsWith('//')) cleanEmbed = 'https:' + cleanEmbed;

    const u = new URL(cleanEmbed);
    let parentUrl = u.searchParams.get('parent') || 'https://animego.me/';
    if (!parentUrl.startsWith('http')) parentUrl = 'https://animego.me/';

    const res = await fetch(u.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': parentUrl,
        'Origin': new URL(parentUrl).origin,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      }
    });

    const html = await res.text();
    const match = html.match(/data-parameters=["']([^"']+)["']/i);

    if (!match) {
      return new Response(JSON.stringify({ success: false, error: 'data-parameters not found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Полная очистка HTML-сущностей
    let rawParams = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    const params = JSON.parse(rawParams);

    // Функция безопасного извлечения URL
    const extractSrc = (data: any): string => {
      if (!data) return '';
      let target = data;
      if (typeof target === 'string') {
        // Убираем двойные слэши экранирования
        const unescaped = target.replace(/\\"/g, '"').replace(/\\\//g, '/');
        try {
          target = JSON.parse(unescaped);
        } catch (_) {
          return unescaped;
        }
      }
      if (typeof target === 'object' && target !== null) {
        return target['1080'] || target['720'] || target.src || target.url || '';
      }
      return '';
    };

    let hlsSrc = extractSrc(params.hls);
    let dashSrc = extractSrc(params.dash);

    const primarySrc = hlsSrc || dashSrc;
    const streamType = hlsSrc ? 'hls' : 'dash';

    if (!primarySrc) {
      return new Response(JSON.stringify({ success: false, error: 'Stream URL not found in parameters' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Сессия CDN2
    const videoHash = params.id || (primarySrc.match(/\/([a-f0-9]{32,64})/i)?.[1]);
    if (videoHash) {
      try {
        await fetch(`https://aniboom.one/cdn2/${videoHash}`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://aniboom.one',
            'Referer': u.toString(),
            'Content-Type': 'application/json'
          }
        });
      } catch (_) {}
    }

    let cleanSrc = primarySrc.replace(/\\\//g, '/');
    if (cleanSrc.startsWith('//')) cleanSrc = 'https:' + cleanSrc;

    return new Response(JSON.stringify({
      success: true,
      streamType,
      url: `/api/proxy-4k?url=${encodeURIComponent(cleanSrc)}&referer=${encodeURIComponent('https://aniboom.one/')}`,
      direct_url: cleanSrc,
      quality: '1080p',
      provider: 'aniboom'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
