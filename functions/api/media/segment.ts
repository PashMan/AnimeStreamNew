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

  try {
    const segmentUrlObj = new URL(segmentUrl);
    const referer = `https://${segmentUrlObj.host}/` || 'https://kodik.info/';

    let response: Response | undefined;
    let attempts = 3;
    let baseDelay = 300;
    let lastError: any = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      try {
        response = await fetch(segmentUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Referer': referer,
            'Accept': '*/*'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          break;
        } else {
          lastError = new Error(`Status ${response.status}`);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;
      }

      if (attempt < attempts) {
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        baseDelay *= 1.5;
      }
    }

    if (!response || !response.ok) {
      const errMsg = lastError ? lastError.message : 'Unknown error';
      return new Response(`Error fetching segment after retries: ${errMsg}`, { 
        status: response ? response.status : 502,
        headers: { 
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const arrayBuffer = await response.arrayBuffer();

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'video/mp2t',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  } catch (e: any) {
    return new Response('Exception during segment fetch: ' + e.message, {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*'
      }
    });
  }
}
