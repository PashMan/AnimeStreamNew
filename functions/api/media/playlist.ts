// functions/api/media/playlist.ts

function convertChar(char: string, rotNum: number): string {
  if (!char.match(/[a-zA-Z]/)) return char;
  const code = char.charCodeAt(0);
  let start = 65;
  if (code >= 97) start = 97;
  return String.fromCharCode(((code - start + rotNum) % 26) + start);
}

function decodeKodikUrl(encoded: string): string {
  for (let rot = 0; rot < 26; rot++) {
    const crypted = encoded.split('').map(c => convertChar(c, rot)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) return decoded;
    } catch {}
  }
  return encoded;
}

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

  const reqUrl = new URL(request.url);
  const urlParam = reqUrl.searchParams.get('url') || '';
  const fallbackUrl = reqUrl.searchParams.get('fallback_url') || '';
  const resolveOnly = reqUrl.searchParams.get('resolve') === 'true';

  if (!urlParam && !fallbackUrl) {
    return new Response(JSON.stringify({ error: 'url is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  let cleanTarget = safeUnescape(urlParam || fallbackUrl);

  // -------------------------------------------------------------
  // 1. ПОПЫТКА ИЗВЛЕЧЕНИЯ ПОТОКА ANIBOOM (1080p)
  // -------------------------------------------------------------
  if (cleanTarget.includes('aniboom')) {
    try {
      const parsedUrl = new URL(cleanTarget.startsWith('//') ? `https:${cleanTarget}` : cleanTarget);
      let parentReferer = parsedUrl.searchParams.get('parent') || 'https://animego.me/';
      parentReferer = safeUnescape(parentReferer);
      if (!parentReferer.startsWith('http')) parentReferer = 'https://animego.me/';

      const fetchHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': parentReferer,
        'Origin': new URL(parentReferer).origin,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };

      let embedRes = await fetch(parsedUrl.toString(), { headers: fetchHeaders });
      let html = embedRes.ok ? await embedRes.text() : '';
      let match = html ? (html.match(/data-parameters="([^"]+)"/) || html.match(/data-parameters='([^']+)'/)) : null;

      // Если с текущим translation не нашлось data-parameters, пробуем без него
      if (!match && parsedUrl.searchParams.has('translation')) {
        const retryUrl = new URL(parsedUrl.toString());
        retryUrl.searchParams.delete('translation');
        const retryRes = await fetch(retryUrl.toString(), { headers: fetchHeaders });
        if (retryRes.ok) {
          const retryHtml = await retryRes.text();
          match = retryHtml.match(/data-parameters="([^"]+)"/) || retryHtml.match(/data-parameters='([^']+)'/);
        }
      }

      if (match) {
        const rawParams = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
        const params = JSON.parse(rawParams);

        // CDN2 Handshake (POST)
        const videoHash = params.id;
        if (videoHash) {
          try {
            await fetch(`https://aniboom.one/cdn2/${videoHash}`, {
              method: 'POST',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Origin': 'https://aniboom.one',
                'Referer': parsedUrl.toString(),
                'Content-Type': 'application/json'
              },
              body: '{}'
            });
          } catch (_) {}
        }

        let hlsData = params.hls || params.dash;
        if (typeof hlsData === 'string') {
          try { hlsData = JSON.parse(hlsData); } catch (_) {}
        }
        let rawStreamUrl = typeof hlsData === 'object' && hlsData !== null
          ? (hlsData['1080'] || hlsData['720'] || hlsData.src || hlsData.url || '')
          : (hlsData || '');

        if (rawStreamUrl) {
          if (rawStreamUrl.startsWith('//')) rawStreamUrl = `https:${rawStreamUrl}`;
          const proxiedRelative = `/api/proxy-4k?url=${encodeURIComponent(rawStreamUrl)}&referer=${encodeURIComponent('https://aniboom.one/')}`;

          if (resolveOnly) {
            return new Response(JSON.stringify({
              success: true,
              streamType: 'hls',
              qualities: [1080, 720, 480, 360],
              quality: 1080,
              direct_url: rawStreamUrl,
              url: proxiedRelative
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
          }

          // Абсолютный URL для Response.redirect в Cloudflare Workers
          const absoluteRedirectUrl = new URL(proxiedRelative, request.url).toString();
          return Response.redirect(absoluteRedirectUrl, 302);
        }
      }
    } catch (e: any) {
      console.warn('[AniBoom Resolve Failed, switching to Kodik]:', e.message);
    }
  }

  // -------------------------------------------------------------
  // 2. РЕЗЕРВНОЕ ИЗВЛЕЧЕНИЕ ПОТОКА KODIK
  // -------------------------------------------------------------
  const kodikTarget = fallbackUrl || (cleanTarget.includes('kodik') ? cleanTarget : '');

  if (kodikTarget) {
    try {
      let iframeUrl = kodikTarget.startsWith('//') ? `https:${kodikTarget}` : kodikTarget;
      iframeUrl = iframeUrl.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space|kodik\.ru|kodikonline\.com|kodikhd\.club|kodik-api\.com)/g, 'kodikplayer.com');

      const iframeRes = await fetch(iframeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://shikimori.one/'
        }
      });
      const html = await iframeRes.text();

      const urlParamsMatch = html.match(/urlParams\s*=\s*'([^']+)'/) || html.match(/urlParams\s*=\s*"([^"]+)"/);
      const hashMatch = html.match(/\.hash\s*=\s*'([^']+)'/) || html.match(/\.hash\s*=\s*"([^"]+)"/);
      const idMatch = html.match(/\.id\s*=\s*'([^']+)'/) || html.match(/\.id\s*=\s*"([^"]+)"/);
      const typeMatch = html.match(/\.type\s*=\s*'([^']+)'/) || html.match(/\.type\s*=\s*"([^"]+)"/);

      if (urlParamsMatch && hashMatch && idMatch && typeMatch) {
        const urlParams = JSON.parse(urlParamsMatch[1]);
        const baseUrlObj = new URL(iframeUrl);
        const scriptAbsoluteUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}/assets/js/app.serial.js`;

        const scriptRes = await fetch(scriptAbsoluteUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': iframeUrl }
        });
        const scriptHtml = await scriptRes.text();
        const ajaxMatch = scriptHtml.match(/\$.ajax\([\s\S]*?url:\s*atob\("([^"]+)"\)/) || scriptHtml.match(/atob\("([^"'\(\)]+)"\)/);

        if (ajaxMatch) {
          const gboxPath = atob(ajaxMatch[1]);
          const gboxUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${gboxPath}`;

          const payload = new URLSearchParams({
            hash: hashMatch[1],
            id: idMatch[1],
            type: typeMatch[1],
            d: urlParams.d || 'kodik.info',
            d_sign: urlParams.d_sign || '',
            pd: urlParams.pd || '',
            pd_sign: urlParams.pd_sign || '',
            ref: decodeURIComponent(urlParams.ref || ''),
            ref_sign: urlParams.ref_sign || '',
            bad_user: 'true',
            cdn_is_working: 'true'
          });

          const gboxRes = await fetch(gboxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'Mozilla/5.0',
              'Referer': iframeUrl
            },
            body: payload.toString()
          });

          const gboxData = await gboxRes.json() as any;
          if (gboxData?.links) {
            const qualities = Object.keys(gboxData.links).map(Number).sort((a, b) => b - a);
            const bestQuality = qualities[0] || 720;
            const rawSrc = gboxData.links[String(bestQuality)]?.[0]?.src;

            if (rawSrc) {
              const decrypted = rawSrc.includes('mp4:hls:manifest') ? rawSrc : decodeKodikUrl(rawSrc);
              const playlistUrl = decrypted.startsWith('//') ? `https:${decrypted}` : decrypted;
              const proxiedKodikUrl = `/api/proxy-4k?url=${encodeURIComponent(playlistUrl)}&referer=${encodeURIComponent('https://kodik.info/')}`;

              if (resolveOnly) {
                return new Response(JSON.stringify({
                  success: true,
                  streamType: 'hls',
                  qualities,
                  quality: bestQuality,
                  direct_url: playlistUrl,
                  url: proxiedKodikUrl
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                });
              }

              // Абсолютный URL для Response.redirect в Cloudflare Workers
              const absoluteKodikRedirect = new URL(proxiedKodikUrl, request.url).toString();
              return Response.redirect(absoluteKodikRedirect, 302);
            }
          }
        }
      }
    } catch (kErr: any) {
      console.warn('[Kodik Parse Failed]:', kErr.message);
    }
  }

  // -------------------------------------------------------------
  // 3. ОТВЕТ ДЛЯ ПЕРЕКЛЮЧЕНИЯ НА IFRAME ПРИ ПОЛНОЙ НЕДОСТУПНОСТИ
  // -------------------------------------------------------------
  return new Response(JSON.stringify({
    error: 'stream_unavailable',
    fallback_url: fallbackUrl
  }), {
    status: 502,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
