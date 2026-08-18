// functions/api/test-aniboom.ts

export async function onRequest(context: any) {
  const { request } = context;
    const reqUrl = new URL(request.url);
      
        // URL серии из вашего лога
          const targetUrl = reqUrl.searchParams.get('url') || 
              'https://aniboom.one/embed/38kMR9yqEO4?episode=1&parent=https%3A%2F%2Fanimego.me%2Fanime%2Fre-zhizn-v-al-ternativnom-mire-s-nulya-4-3279';

                try {
                    const res = await fetch(targetUrl, {
                          headers: {
                                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                          'Referer': 'https://animego.me/anime/re-zhizn-v-al-ternativnom-mire-s-nulya-4-3279',
                                                  'Origin': 'https://animego.me',
                                                          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                                                  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
                                                                        }
                                                                            });

                                                                                const status = res.status;
                                                                                    const headers = Object.fromEntries(res.headers.entries());
                                                                                        const bodyText = await res.text();
                                                                                            const hasDataParams = bodyText.includes('data-parameters');

                                                                                                return new Response(JSON.stringify({
                                                                                                      targetUrl,
                                                                                                            status,
                                                                                                                  hasDataParams,
                                                                                                                        bodyPreview: bodyText.slice(0, 1500),
                                                                                                                              headers
                                                                                                                                  }, null, 2), {
                                                                                                                                        status: 200,
                                                                                                                                              headers: { 'Content-Type': 'application/json; charset=utf-8' }
                                                                                                                                                  });
                                                                                                                                                    } catch (err: any) {
                                                                                                                                                        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
                                                                                                                                                          }
                                                                                                                                                          }
                                                                                                                                                          