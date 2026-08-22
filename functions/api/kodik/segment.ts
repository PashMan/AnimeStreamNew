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

  // OPTIMIZATION: Redirect directly to CDN segment URL with 302 Found
  // Prevents piping gigabytes of video data through Worker CPU & bandwidth limits.
  return new Response(null, {
    status: 302,
    headers: {
      'Location': segmentUrl,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Cache-Control': 'public, max-age=86400'
    }
  });
};
