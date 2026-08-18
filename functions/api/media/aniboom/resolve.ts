// functions/api/media/aniboom/resolve.ts

function safeUnescape(str: string): string {
  let res = str || '';
  for (let i = 0; i < 3; i++) {
    if (res.includes('%25') || res.includes('%3A') || res.includes('%2F')) {
      try {
        const next = decodeURIComponent(res);
        if (next === res) break;
        res = next;
      } catch (_) { break; }
    } else { break; }
  }
  return res;
}

export async function onRequest(context: any) {
  const { request } = context;
  const urlObj = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  let embed_url: string | undefined;
  let episode: number = 1;
  let translation_id: string | undefined;

  if (request.method === 'POST') {
    try {
      const body = await request.clone().json() as any;
      if (body) {
        embed_url = body.embed_url || body.url;
        episode = parseInt(body.episode || '1') || 1;
        translation_id = body.translation_id ? String(body.translation_id) : undefined;
      }
    } catch (_) {}
  }

  if (!embed_url) {
    embed_url = urlObj.searchParams.get('embed_url') || urlObj.searchParams.get('url') || undefined;
    const epQuery = urlObj.searchParams.get('episode');
    if (epQuery) episode = parseInt(epQuery) || 1;
    translation_id = urlObj.searchParams.get('translation_id') || undefined;
  }

  if (!embed_url) {
    return new Response(JSON.stringify({
      success: false,
      error: 'embed_url parameter is required'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  let cleanEmbedUrl = safeUnescape(embed_url);
  if (cleanEmbedUrl.startsWith('//')) cleanEmbedUrl = `https:${cleanEmbedUrl}`;

  try {
    const u = new URL(cleanEmbedUrl);
    if (!u.searchParams.has('episode')) {
      u.searchParams.set('episode', String(episode));
    }
    if (translation_id && /^\d+$/.test(String(translation_id)) && !u.searchParams.has('translation')) {
      u.searchParams.set('translation', String(translation_id));
    }
    cleanEmbedUrl = u.toString();
  } catch (_) {}

  try {
    let parentReferer = 'https://animego.me/';
    try {
      const parsedUrlObj = new URL(cleanEmbedUrl);
      const parentParam = parsedUrlObj.searchParams.get('parent');
      if (parentParam) {
        const decodedParent = safeUnescape(parentParam);
        if (decodedParent.startsWith('http')) parentReferer = decodedParent;
      }
    } catch (_) {}

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': parentReferer,
      'Origin': new URL(parentReferer).origin,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    let aRes = await fetch(cleanEmbedUrl, { headers: fetchHeaders });
    let html = aRes.ok ? await aRes.text() : '';
    let match = html ? (html.match(/data-parameters="([^"]+)"/) || html.match(/data-parameters='([^']+)'/)) : null;

    // Retry without translation parameter if data-parameters was not found
    if (!match && cleanEmbedUrl.includes('translation=')) {
      try {
        const retryUrl = new URL(cleanEmbedUrl);
        retryUrl.searchParams.delete('translation');
        const retryRes = await fetch(retryUrl.toString(), { headers: fetchHeaders });
        if (retryRes.ok) {
          const retryHtml = await retryRes.text();
          match = retryHtml.match(/data-parameters="([^"]+)"/) || retryHtml.match(/data-parameters='([^']+)'/);
        }
      } catch (_) {}
    }

    if (!match) {
      return new Response(JSON.stringify({
        success: false,
        error: 'data-parameters attribute not found in Aniboom embed HTML'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const rawParams = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    let decoded: any;
    try {
      decoded = JSON.parse(rawParams);
    } catch (parseErr: any) {
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to parse data-parameters JSON: ${parseErr.message}`
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // CDN2 Handshake via POST (Referer: cleanEmbedUrl, Origin: https://aniboom.one)
    const videoHash = decoded.id;
    if (videoHash) {
      try {
        await fetch(`https://aniboom.one/cdn2/${videoHash}`, {
          method: 'POST',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Origin': 'https://aniboom.one',
            'Referer': cleanEmbedUrl,
            'Content-Type': 'application/json'
          },
          body: '{}'
        });
      } catch (_) {}
    }

    let hlsSrc = '';
    if (decoded.hls) {
      try {
        const hlsObj = typeof decoded.hls === 'string' ? JSON.parse(decoded.hls) : decoded.hls;
        if (typeof hlsObj === 'object' && hlsObj !== null) {
          hlsSrc = hlsObj['1080'] || hlsObj['720'] || hlsObj['480'] || hlsObj['360'] || hlsObj.src || hlsObj.url || '';
        } else if (typeof hlsObj === 'string') {
          hlsSrc = hlsObj;
        }
      } catch (_) {}
    }

    let dashSrc = '';
    if (decoded.dash) {
      try {
        const dashObj = typeof decoded.dash === 'string' ? JSON.parse(decoded.dash) : decoded.dash;
        if (typeof dashObj === 'object' && dashObj !== null) {
          dashSrc = dashObj['1080'] || dashObj['720'] || dashObj['480'] || dashObj['360'] || dashObj.src || dashObj.url || '';
        } else if (typeof dashObj === 'string') {
          dashSrc = dashObj;
        }
      } catch (_) {}
    }

    if (hlsSrc && hlsSrc.startsWith('//')) hlsSrc = `https:${hlsSrc}`;
    if (dashSrc && dashSrc.startsWith('//')) dashSrc = `https:${dashSrc}`;

    const primarySrc = hlsSrc || dashSrc;
    const streamType = hlsSrc ? 'hls' : 'dash';

    if (!primarySrc) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No valid video stream URL found in Aniboom parameters'
      }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const proxiedUrl = `/api/proxy-4k?url=${encodeURIComponent(primarySrc)}&referer=${encodeURIComponent('https://aniboom.one/')}`;

    return new Response(JSON.stringify({
      success: true,
      streamType: streamType,
      stream_type: streamType,
      url: proxiedUrl,
      direct_url: primarySrc,
      quality: decoded.qualityVideo ? `${decoded.qualityVideo}p` : '1080p'
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=600'
      }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
