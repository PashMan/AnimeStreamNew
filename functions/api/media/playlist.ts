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

export async function onRequest(context: any) {
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

  const urlObj = new URL(request.url);
  let urlParam = urlObj.searchParams.get('url');
  const fallbackUrl = urlObj.searchParams.get('fallback_url');
  const resolveOnly = urlObj.searchParams.get('resolve') === 'true';
  const requestedQuality = urlObj.searchParams.get('quality');

  if (!urlParam) {
    if (fallbackUrl) {
      return Response.redirect(`${getProxyOrigin(request)}/api/proxy-4k?url=${encodeURIComponent(fallbackUrl)}`, 302);
    }
    return new Response(JSON.stringify({ error: 'url parameter is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const safeUnescapeUrl = (u: string): string => {
    let res = u || '';
    for (let i = 0; i < 4; i++) {
      if (res.includes('%')) {
        try {
          const next = decodeURIComponent(res);
          if (next === res) break;
          res = next;
        } catch (_) {
          break;
        }
      } else {
        break;
      }
    }
    return res;
  };

  let cleanUrlParam = safeUnescapeUrl(urlParam);
  let cleanFallbackUrl = fallbackUrl ? safeUnescapeUrl(fallbackUrl) : '';

  // Recursively extract nested /api/media/playlist?url=...
  while (cleanUrlParam.includes('/api/media/playlist') && cleanUrlParam.includes('url=')) {
    try {
      const parsed = new URL(cleanUrlParam, 'http://localhost');
      const nested = parsed.searchParams.get('url');
      if (nested) {
        cleanUrlParam = safeUnescapeUrl(nested);
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }

  if (cleanFallbackUrl) {
    while (cleanFallbackUrl.includes('/api/media/playlist') && cleanFallbackUrl.includes('url=')) {
      try {
        const parsed = new URL(cleanFallbackUrl, 'http://localhost');
        const nested = parsed.searchParams.get('url');
        if (nested) {
          cleanFallbackUrl = safeUnescapeUrl(nested);
        } else {
          break;
        }
      } catch (_) {
        break;
      }
    }
  }

  // If Aniboom URL
  if (cleanUrlParam.includes('aniboom')) {
    try {
      let referer = 'https://animego.me/';
      const parentMatch = cleanUrlParam.match(/[?&]parent=([^&]+)/i);
      if (parentMatch) {
        const decodedParent = safeUnescapeUrl(parentMatch[1]);
        if (decodedParent.startsWith('http://') || decodedParent.startsWith('https://')) {
          referer = decodedParent;
        }
      }

      let parsedTargetUrl: URL;
      try {
        parsedTargetUrl = new URL(cleanUrlParam.startsWith('//') ? `https:${cleanUrlParam}` : cleanUrlParam);
      } catch (_) {
        parsedTargetUrl = new URL('https://aniboom.one');
      }

      if (!parsedTargetUrl.searchParams.has('parent')) {
        parsedTargetUrl.searchParams.set('parent', referer);
      }

      const existingTranslation = parsedTargetUrl.searchParams.get('translation');
      const translationCandidates = existingTranslation 
        ? Array.from(new Set([existingTranslation, '', '16', '24', '1', '2', '3']))
        : ['', '16', '24', '1', '2', '3'];

      const originalParent = parsedTargetUrl.searchParams.get('parent') || referer;
      const originHost = originalParent.startsWith('http') ? new URL(originalParent).origin : 'https://animego.me';

      const candidateReferers = [
        originalParent,
        referer,
        'https://animego.me/',
        'https://animego.org/',
        'https://aniboom.one/'
      ];

      let aHtml = '';
      outerLoop:
      for (const tr of translationCandidates) {
        for (const ref of candidateReferers) {
          try {
            const currentOrigin = ref.startsWith('http') ? new URL(ref).origin : originHost;
            const fetchUrlObj = new URL(parsedTargetUrl.toString());
            if (tr) {
              fetchUrlObj.searchParams.set('translation', tr);
            } else {
              fetchUrlObj.searchParams.delete('translation');
            }
            if (!fetchUrlObj.searchParams.has('parent')) {
              fetchUrlObj.searchParams.set('parent', ref);
            }

            const aRes = await fetch(fetchUrlObj.toString(), {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': ref,
                'Origin': currentOrigin,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Sec-Fetch-Dest': 'iframe',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'cross-site'
              }
            });
            if (aRes.ok) {
              aHtml = await aRes.text();
              if (aHtml && (aHtml.includes('data-parameters') || aHtml.includes('id="video"'))) {
                break outerLoop;
              }
            }
          } catch (_) {}
        }
      }

      if (aHtml) {
        const match = aHtml.match(/data-parameters="([^"]+)"/) || aHtml.match(/data-parameters='([^']+)'/);
        if (match) {
          const decodedHtml = match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&#039;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\\"/g, '"');
          const params = JSON.parse(decodedHtml);

          let hlsData = params.hls;
          if (typeof hlsData === 'string') {
            try {
              hlsData = JSON.parse(hlsData);
            } catch (_) {}
          }

          let dashData = params.dash;
          if (typeof dashData === 'string') {
            try {
              dashData = JSON.parse(dashData);
            } catch (_) {}
          }

          let rawStreamUrl = '';
          if (typeof hlsData === 'object' && hlsData !== null) {
            rawStreamUrl = hlsData['1080'] || hlsData['720'] || hlsData['480'] || hlsData['360'] || hlsData.src || hlsData.url || hlsData.file || '';
          } else if (typeof hlsData === 'string') {
            rawStreamUrl = hlsData;
          }

          if (!rawStreamUrl) {
            if (typeof dashData === 'object' && dashData !== null) {
              rawStreamUrl = dashData['1080'] || dashData['720'] || dashData['480'] || dashData['360'] || dashData.src || dashData.url || dashData.file || '';
            } else if (typeof dashData === 'string') {
              rawStreamUrl = dashData;
            }
          }

          if (rawStreamUrl) {
            if (rawStreamUrl.startsWith('//')) {
              rawStreamUrl = 'https:' + rawStreamUrl;
            }
            const finalStreamUrl = `${getProxyOrigin(request)}/api/proxy-4k?url=${encodeURIComponent(rawStreamUrl)}&referer=${encodeURIComponent('https://aniboom.one/')}`;
            
            if (resolveOnly) {
              return new Response(JSON.stringify({
                success: true,
                streamType: 'hls',
                qualities: [1080, 720, 480, 360],
                quality: 1080,
                direct_url: rawStreamUrl,
                url: finalStreamUrl
              }), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            }

            if (requestedQuality) {
              try {
                const masterRes = await fetch(rawStreamUrl, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://aniboom.one/',
                    'Origin': 'https://aniboom.one'
                  }
                });
                if (masterRes.ok) {
                  const masterText = await masterRes.text();
                  const masterBaseUrl = new URL(rawStreamUrl);
                  let variantUrl = rawStreamUrl;

                  if (masterText.includes('#EXT-X-STREAM-INF')) {
                    const lines = masterText.split('\n');
                    let bestVariantLine = '';
                    let matchedVariantLine = '';
                    for (let i = 0; i < lines.length; i++) {
                      const line = lines[i].trim();
                      if (line.startsWith('#EXT-X-STREAM-INF')) {
                        const nextLine = (lines[i + 1] || '').trim();
                        if (nextLine && !nextLine.startsWith('#')) {
                          if (!bestVariantLine) bestVariantLine = nextLine;
                          if (line.includes(`RESOLUTION=`) && (line.includes(`x${requestedQuality}`) || line.includes(`${requestedQuality}`))) {
                            matchedVariantLine = nextLine;
                            break;
                          }
                        }
                      }
                    }
                    const chosenLine = matchedVariantLine || bestVariantLine;
                    if (chosenLine) {
                      variantUrl = chosenLine.startsWith('http') ? chosenLine : new URL(chosenLine, masterBaseUrl).toString();
                    }
                  }

                  const variantRes = await fetch(variantUrl, {
                    headers: {
                      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'Referer': 'https://aniboom.one/',
                      'Origin': 'https://aniboom.one'
                    }
                  });

                  if (variantRes.ok) {
                    const variantText = await variantRes.text();
                    const variantBaseUrl = new URL(variantUrl);
                    const rewrittenVariant = variantText.split('\n').map(line => {
                      const trimmed = line.trim();
                      if (trimmed && !trimmed.startsWith('#')) {
                        const absSegUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, variantBaseUrl).toString();
                        return `/api/proxy-4k?url=${encodeURIComponent(absSegUrl)}&referer=${encodeURIComponent('https://aniboom.one/')}`;
                      }
                      return line;
                    }).join('\n');

                    return new Response(rewrittenVariant, {
                      status: 200,
                      headers: {
                        'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
                        'Access-Control-Allow-Origin': '*'
                      }
                    });
                  }
                }
              } catch (_) {}
            }

            return Response.redirect(finalStreamUrl, 302);
          }
        }
      }
      throw new Error('Aniboom stream extraction failed');
    } catch (aErr: any) {
      if (fallbackUrl) {
        console.log(`[CF Playlist Resolver] Aniboom failed (${aErr.message}). Seamlessly intercepting fallback stream from Kodik: ${fallbackUrl}`);
        urlParam = fallbackUrl;
      } else {
        console.warn(`[CF Playlist Resolver Error]: ${aErr.message}. Returning 502.`);
        return new Response(
          JSON.stringify({ error: 'aniboom_stream_failed', message: aErr.message }),
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          }
        );
      }
    }
  }

  try {
    let iframeUrl = urlParam.startsWith('//') ? `https:${urlParam}` : urlParam;
    iframeUrl = iframeUrl.replace(/(kodik\.info|kodik\.cc|kodik\.biz|kodik\.net|kodik\.tv|kodik\.club|kodik\.site|kodik\.space|kodik\.ru|kodikonline\.com|kodikhd\.club|kodik-api\.com)/g, 'kodikplayer.com');
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
      console.warn('[CF KODIK PROXY] Failed to parse iframe params. Fallback resolution.');
      if (resolveOnly) {
        return new Response(JSON.stringify({
          success: true,
          streamType: 'hls',
          qualities: [1080, 720, 480, 360],
          quality: 1080,
          fallback: true
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      return new Response(JSON.stringify({ error: 'Failed to parse iframe parameters. Stream might be offline.' }), {
        status: 200,
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
        // Relative URI format compatible with relative redirects
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

    // Validation: Ensure the playlist starts with #EXTM3U (not HTML error or blank page)
    if (!m3u8Text || !m3u8Text.trim().startsWith('#EXTM3U')) {
      console.error(`[CF KODIK PROXY ERROR] Manifest from Kodik is empty or invalid. Res length: ${m3u8Text?.length || 0}. Starts with:`, m3u8Text ? m3u8Text.slice(0, 500) : "empty");
      return new Response('Error: Proxy loaded an invalid M3U8 manifest from Kodik. The source might be blocking or offline.', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // 7. Rewrite chunk entries in M3U8
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

    return new Response(rewrittenText, {
       status: 200,
       headers: {
         'Content-Type': 'application/x-mpegURL',
         'Access-Control-Allow-Origin': '*',
         'Access-Control-Allow-Methods': 'GET, OPTIONS',
         'Access-Control-Allow-Headers': '*',
         'Cache-Control': 'no-cache, no-store, must-revalidate',
       }
    });

  } catch (error: any) {
    console.error('[CF KODIK PROXY ERROR]', error);
    if (resolveOnly) {
      return new Response(JSON.stringify({
        success: true,
        streamType: 'hls',
        qualities: [1080, 720, 480, 360],
        quality: 1080,
        fallback: true
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    return new Response(
      JSON.stringify({ error: 'playlist_compile_failed', message: error.message }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      }
    );
  }
}
