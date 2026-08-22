function convertChar(char: string, rotNum: number): string {
  if (!char.match(/[a-zA-Z]/)) return char;
  const code = char.charCodeAt(0);
  let start = 65; // 'A'
  if (code >= 97) start = 97; // 'a'
  return String.fromCharCode(((code - start + rotNum) % 26) + start);
}

function decodeKodikUrl(encoded: string, rotNum?: number): string {
  if (rotNum !== undefined) {
    const crypted = encoded.split('').map(c => convertChar(c, rotNum)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) return decoded;
    } catch {}
  }
  for (let rot = 0; rot < 26; rot++) {
    const crypted = encoded.split('').map(c => convertChar(c, rot)).join('');
    const padding = (4 - (crypted.length % 4)) % 4;
    try {
      const decoded = atob(crypted + '='.repeat(padding));
      if (decoded.includes('mp4:hls:manifest')) {
         return decoded;
      }
    } catch {}
  }
  throw new Error('Decryption of Kodik stream URL failed');
}

function getProxyOrigin(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '') || 'http';
  let host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host || 'localhost:3000';
  if (host.startsWith('http://') || host.startsWith('https://')) {
    return host;
  }
  return `${proto}://${host}`;
}

export const onRequest = async (context: any) => {
  const { request } = context;

  // OPTIONS CORS header preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // 1. DONOR STREAM EDGE CACHE: Check if parsed manifest/stream is cached
  const cache = (caches as any).default;
  const cacheKey = new Request(request.url, request);
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  } catch (_) {}

  const urlObj = new URL(request.url);
  const urlParam = urlObj.searchParams.get('url');
  if (!urlParam) {
    return new Response(JSON.stringify({ error: 'url parameter is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    let iframeUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
    iframeUrl = iframeUrl.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space)/g, 'kodikplayer.com');
    console.log(`[CF KODIK PROXY] Extracting playlist from: ${iframeUrl}`);

    // 1. Fetch iframe page
    const iframeRes = await fetch(iframeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Referer': 'https://shikimori.one/'
      }
    });
    const html = await iframeRes.text();

    // 2. Extract parameters
    const urlParamsMatch = html.match(/urlParams\s*=\s*'([^']+)'/) || html.match(/urlParams\s*=\s*"([^"]+)"/) || html.match(/urlParams\s*=\s*({[^;]+})/);
    const hashMatch = html.match(/\.hash\s*=\s*'([^']+)'/) || html.match(/\.hash\s*=\s*"([^"]+)"/) || html.match(/\.hash\s*=\s*['"]([^'"]+)['"]/);
    const idMatch = html.match(/\.id\s*=\s*'([^']+)'/) || html.match(/\.id\s*=\s*"([^"]+)"/) || html.match(/\.id\s*=\s*['"]([^'"]+)['"]/);
    const typeMatch = html.match(/\.type\s*=\s*'([^']+)'/) || html.match(/\.type\s*=\s*"([^"]+)"/) || html.match(/\.type\s*=\s*['"]([^'"]+)['"]/);

    if (!urlParamsMatch || !hashMatch || !idMatch || !typeMatch) {
      console.error('[CF KODIK PROXY] Failed to parse iframe params');
      return new Response(JSON.stringify({ error: 'Failed to parse iframe parameters. Stream might be offline.' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const urlParams = JSON.parse(urlParamsMatch[1]);
    const videoHash = hashMatch[1];
    const videoId = idMatch[1];
    const videoType = typeMatch[1];

    // Find script url (preferring serial/player minified js in assets)
    let scriptUrl = '';
    const scriptTagRegex = /<script\b[^>]*?\bsrc\s*=\s*["']([^"']+\.js[^"']*)["']/gi;
    let match;
    const candidateScripts: string[] = [];
    while ((match = scriptTagRegex.exec(html)) !== null) {
      candidateScripts.push(match[1]);
    }

    const assetScript = candidateScripts.find(s => s.includes('/assets/'));
    if (assetScript) {
      scriptUrl = assetScript;
    } else if (candidateScripts.length > 0) {
      scriptUrl = candidateScripts[0];
    }

    if (!scriptUrl) {
      const inlineJsMatch = html.match(/["'](\/assets\/js\/app\.[^"']+\.js)["']/);
      if (inlineJsMatch) {
        scriptUrl = inlineJsMatch[1];
      }
    }

    if (!scriptUrl) {
      scriptUrl = '/assets/js/app.serial.js'; // fallback
    }

    const baseUrlObj = new URL(iframeUrl);
    const scriptAbsoluteUrl = scriptUrl.startsWith('http') ? scriptUrl : `${baseUrlObj.protocol}//${baseUrlObj.host}${scriptUrl}`;

    // 3. Request script to get Gbox Ajax link
    const scriptRes = await fetch(scriptAbsoluteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': iframeUrl
      }
    });
    const scriptHtml = await scriptRes.text();

    const ajaxMatch = scriptHtml.match(/\$.ajax\([\s\S]*?url:\s*atob\("([^"]+)"\)/) || 
                      scriptHtml.match(/atob\("([^"'\(\)]+)"\)/);
    if (!ajaxMatch) {
      console.error('[CF KODIK PROXY] Gbox ajax match failed');
      return new Response(JSON.stringify({ error: 'Could not extract player API script' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const gboxPath = atob(ajaxMatch[1]);
    const gboxUrl = `${baseUrlObj.protocol}//${baseUrlObj.host}${gboxPath}`;

    // 4. Request video links from gbox
    const payload = new URLSearchParams({
      hash: videoHash,
      id: videoId,
      type: videoType,
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': iframeUrl
      },
      body: payload.toString()
    });

    const gboxData = await gboxRes.json() as any;
    if (!gboxData || !gboxData.links) {
      console.error('[CF KODIK PROXY] Gbox returned no links', gboxData);
      return new Response('Error: Failed to retrieve stream links from Kodik', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 5. Build dynamic Master Playlist or yield single-quality playlist based on query parameters
    const targetQuality = urlObj.searchParams.get('quality');
    const qualities = Object.keys(gboxData.links).map(Number).sort((a,b) => b - a); // descending quality: 720, 360, etc.

    if (urlObj.searchParams.get('resolve') === 'true') {
      const resolvedLinks: Record<string, string> = {};
      for (const qual of Object.keys(gboxData.links)) {
        const listSources = gboxData.links[qual];
        if (listSources && listSources.length > 0) {
          try {
            const rawSrc = listSources[0].src;
            const decryptedUrl = rawSrc.includes('mp4:hls:manifest') ? rawSrc : decodeKodikUrl(rawSrc);
            resolvedLinks[qual] = decryptedUrl.startsWith('//') ? `https:${decryptedUrl}` : decryptedUrl;
          } catch (de_err: any) {
            console.error(`[CF KODIK PROXY] Decryption failed for quality ${qual}:`, de_err.message);
          }
        }
      }
      return new Response(JSON.stringify({
        success: true,
        links: resolvedLinks,
        qualities
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    if (!targetQuality && qualities.length > 1) {
      console.log(`[CF KODIK PROXY] Building Master Playlist for available qualities: ${qualities.join(', ')}`);
      const masterLines = ['#EXTM3U', '#EXT-X-VERSION:3'];
      
      qualities.forEach(q => {
        let width = 1280, height = 720, bandwidth = 2200000;
        if (q === 480) {
          width = 854; height = 480; bandwidth = 1100000;
        } else if (q === 360) {
          width = 640; height = 360; bandwidth = 600000;
        } else if (q === 1080) {
          width = 1920; height = 1080; bandwidth = 4500000;
        }
        
        masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height},NAME="${q}p"`);
        // Use /api/media path here to bypass Russian ISP/adblocker blocks on client computers!
        masterLines.push(`/api/media/playlist?url=${encodeURIComponent(iframeUrl)}&quality=${q}`);
      });

      return new Response(masterLines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-mpegURL',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

    const selectedQual = targetQuality || String(qualities[0] || 720);
    const listSources = gboxData.links[selectedQual] || gboxData.links[String(qualities[0] || 720)];
    if (!listSources || listSources.length === 0) {
      return new Response('Error: No video stream matches found for target quality', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const rawSrc = listSources[0].src;
    // Decrypt the URL if it doesn't already contain manifest
    const decryptedUrl = rawSrc.includes('mp4:hls:manifest') ? rawSrc : decodeKodikUrl(rawSrc);
    const playlistUrl = decryptedUrl.startsWith('//') ? `https:${decryptedUrl}` : decryptedUrl;

    console.log(`[CF KODIK PROXY] Fetched decrypted stream. Base HLS: ${playlistUrl}`);

    // 6. Fetch the actual M3U8 file contents
    const m3u8Res = await fetch(playlistUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://kodik.info/'
      }
    });

    if (!m3u8Res.ok) {
      console.error(`[CF KODIK PROXY] Failed to fetch M3U8, status: ${m3u8Res.status}`);
      return new Response(`Error: Kodik manifest loading failed with status ${m3u8Res.status}`, {
        status: m3u8Res.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const m3u8Text = await m3u8Res.text();

    // Validation: Ensure the playlist starts with #EXTM3U
    if (!m3u8Text || !m3u8Text.trim().startsWith('#EXTM3U')) {
      console.error(`[CF KODIK PROXY ERROR] Manifest from Kodik is empty or invalid.`);
      return new Response('Error: Proxy loaded an invalid M3U8 manifest from Kodik.', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 7. Rewrite chunk entries in M3U8 using /api/media/segment to bypass adblockers
    const m3u8Base = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
    
    // Clean CRLF and split cleanly to avoid breaking tags
    const lines = m3u8Text.replace(/\r/g, '').split('\n');
    const proxyUrlBase = `${getProxyOrigin(request)}/api/media/segment?url=`;

    const rewrittenLines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      
      // Resolve path
      let absSegmentUrl = trimmed;
      if (!trimmed.startsWith('http')) {
        absSegmentUrl = trimmed.startsWith('/') 
          ? new URL(trimmed, playlistUrl).toString()
          : m3u8Base + trimmed;
      }

      // Add segment proxy URL
      return `${proxyUrlBase}${encodeURIComponent(absSegmentUrl)}`;
    });

    const rewrittenText = rewrittenLines.join('\n');

    const finalRes = new Response(rewrittenText, {
       status: 200,
       headers: {
         'Content-Type': 'application/x-mpegURL; charset=utf-8',
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Methods': 'GET, OPTIONS',
         'Access-Control-Allow-Headers': '*',
         'Cache-Control': 'public, max-age=1800, s-maxage=1800',
       }
    });

    try { context.waitUntil(cache.put(cacheKey, finalRes.clone())); } catch (_) {}
    return finalRes;

  } catch (error: any) {
    console.error('[CF KODIK PROXY ERROR]', error);
    return new Response('Error: Failed to compile streaming proxy playlist. ' + error.message, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }
}
