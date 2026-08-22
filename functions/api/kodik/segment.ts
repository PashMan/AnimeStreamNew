export async function onRequest(context: any) {
  const { request } = context;

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

  const rawUrl = request.url;
  let segmentUrl = '';
  const urlIndex = rawUrl.indexOf('url=');
  if (urlIndex !== -1) {
    const extracted = rawUrl.substring(urlIndex + 4);
    try {
      segmentUrl = decodeURIComponent(extracted);
    } catch (err) {
      segmentUrl = new URL(rawUrl).searchParams.get('url') || '';
    }
  } else {
    segmentUrl = new URL(rawUrl).searchParams.get('url') || '';
  }

  if (!segmentUrl) {
    return new Response(JSON.stringify({ error: 'No segment URL provided' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // Edge cache lookup
  const cache = (caches as any).default;
  const cacheKey = new Request(request.url, request);
  try {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  } catch (_) {}

  try {
    const segmentUrlObj = new URL(segmentUrl);
    const referer = `https://${segmentUrlObj.host}/` || 'https://kodik.info/';

    const response = await fetch(segmentUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': '*/*'
      }
    });

    if (!response.ok) {
      return new Response(`Error fetching segment: ${response.status}`, {
        status: response.status,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const bodyData = await response.arrayBuffer();
    const finalResponse = new Response(bodyData, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp2t',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });

    try { context.waitUntil(cache.put(cacheKey, finalResponse.clone())); } catch (_) {}
    return finalResponse;
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Segment proxy fetch failed: ' + e.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
