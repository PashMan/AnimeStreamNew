export async function onRequest(context: any) {
  const { request } = context;
  const url = new URL(request.url);
  let urlParam = url.searchParams.get('url');

  if (!urlParam) {
    return new Response('url parameter is required', { status: 400 });
  }

  if (urlParam.startsWith('//')) {
    urlParam = `https:${urlParam}`;
  }

  let sanitizedUrl = urlParam;
  if (!sanitizedUrl.includes('kodikplayer.com') && !sanitizedUrl.includes('anivod.com') && !sanitizedUrl.includes('kodik.info')) {
    sanitizedUrl = sanitizedUrl.replace(/\/\/(kodik\.biz|kodik\.cc|kodik\.link|kodik\.me)\//i, '//kodikplayer.com/');
  }

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>KamiPlayer Kodik</title>
  <script>
    try { window.M_ID = window.M_ID || {}; } catch(e){}
    window.addEventListener('unhandledrejection', function(e) { e.preventDefault(); });
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #000;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      display: block;
    }
  </style>
</head>
<body>
  <iframe
    src="${sanitizedUrl.replace(/"/g, '&quot;')}"
    allow="autoplay *; fullscreen *; accelerometer; gyroscope; picture-in-picture; encrypted-media;"
    referrerpolicy="no-referrer"
    allowfullscreen>
  </iframe>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
