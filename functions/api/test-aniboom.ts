// functions/api/test-aniboom.ts

export async function onRequest(context: any) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  
  const targetUrl = reqUrl.searchParams.get('url') || 
    'https://aniboom.one/embed/9ZLq9oYXN5G?episode=1&translation=16&parent=https%3A%2F%2Fanimego.me%2Fanime%2Fblich-tysyacheletnyaya-krovavaya-voina-bedstviye-3590';

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://animego.me/',
        'Origin': 'https://animego.me',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      }
    });

    const bodyText = await res.text();

    return new Response(JSON.stringify({
      httpStatus: res.status,
      bodyLength: bodyText.length,
      headers: Object.fromEntries(res.headers.entries()),
      rawHtml: bodyText // Выводим полный ответ AniBoom
    }, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}