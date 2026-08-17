interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  GOOGLE_SERVICE_ACCOUNT?: string;
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string | null> {
  try {
    const credentials = JSON.parse(serviceAccountJson);
    const header = { alg: 'RS256', typ: 'JWT' };
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const payload = {
      iss: credentials.client_email,
      sub: credentials.client_email,
      aud: credentials.token_uri,
      iat,
      exp,
      scope: 'https://www.googleapis.com/auth/indexing'
    };

    const textEncoder = new TextEncoder();
    
    const utf8ToBase64Url = (str: string) => {
      const utf8Bytes = textEncoder.encode(str);
      let binary = '';
      for (let i = 0; i < utf8Bytes.length; i++) {
        binary += String.fromCharCode(utf8Bytes[i]);
      }
      return btoa(binary).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
    };

    const headerB64 = utf8ToBase64Url(JSON.stringify(header));
    const payloadB64 = utf8ToBase64Url(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const pem = credentials.private_key.split('-----')[2].replace(/\s+/g, '');
    const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    
    const key = await crypto.subtle.importKey(
      'pkcs8',
      binaryDer.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      textEncoder.encode(signatureInput)
    );

    let binarySig = '';
    const sigBytes = new Uint8Array(signature);
    for (let i = 0; i < sigBytes.length; i++) {
      binarySig += String.fromCharCode(sigBytes[i]);
    }
    const signatureB64 = btoa(binarySig).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');

    const jwt = `${signatureInput}.${signatureB64}`;

    const tokenResponse = await fetch(credentials.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const tokenData = await tokenResponse.json() as any;
    return tokenData.access_token || null;
  } catch (e) {
    console.error('Failed to get Google Access Token:', e);
    return null;
  }
}

async function runTelegramNotifications(env: Env) {
  console.log('Starting Telegram notifications check...');
  try {
    // 1. Get tracked animes that have active subscribers
    const { results: trackedAnimes } = await env.DB.prepare(
      "SELECT DISTINCT t.* FROM anime_episodes_tracker t JOIN telegram_subscriptions s ON t.anime_id = s.anime_id"
    ).all();

    if (!trackedAnimes || trackedAnimes.length === 0) {
      console.log('No animes tracked for notifications.');
      return;
    }

    for (const tracker of trackedAnimes) {
      try {
        // 2. Fetch latest info from Kodik
        const response = await fetch(`https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&shikimori_id=${tracker.anime_id}`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const text = await response.text();
        console.log(`Kodik response for ${tracker.anime_id}:`, text);
        if (!response.ok) continue;
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error(`Failed to parse Kodik JSON for ${tracker.anime_id}:`, e);
          continue;
        }

        if (!data.results || data.results.length === 0) continue;

        let currentAired = 0;
        for (const result of data.results) {
          const ep = result.last_episode || result.episodes_count || 0;
          console.log(`Parsing result for ${tracker.anime_id}: last_episode=${result.last_episode}, episodes_count=${result.episodes_count}, ep=${ep}`);
          if (ep > currentAired) currentAired = ep;
        }

        // 3. If new episode aired
        if (currentAired > (tracker.episodes_aired as number)) {
          console.log(`[UPDATE] New episode for ${tracker.title}: ${tracker.episodes_aired} -> ${currentAired}`);

          // Update tracker in DB to the latest episode count
          await env.DB.prepare(
            "UPDATE anime_episodes_tracker SET episodes_aired = ?, last_checked_at = CURRENT_TIMESTAMP WHERE anime_id = ?"
          ).bind(currentAired, tracker.anime_id).run();

          // Ping IndexNow to index the new episode page immediately
          try {
            const episodeUrl = `https://kamianime.club/anime/${tracker.anime_id}/episode/${currentAired}`;
            const indexNowResponse = await fetch('https://api.indexnow.org/indexnow', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json; charset=utf-8'
              },
              body: JSON.stringify({
                host: 'kamianime.club',
                key: 'kamianime-indexnow-key',
                keyLocation: 'https://kamianime.club/kamianime-indexnow-key.txt',
                urlList: [
                  episodeUrl,
                  `https://kamianime.club/anime/${tracker.anime_id}`
                ]
              })
            });
            console.log(`[IndexNow] Pinged for ${tracker.title} (Status: ${indexNowResponse.status})`);
          } catch (indexErr) {
            console.error(`[IndexNow] Error pinging for ${tracker.title}:`, indexErr);
          }

          // Ping Google Indexing API
          if (env.GOOGLE_SERVICE_ACCOUNT) {
            try {
              const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT);
              if (accessToken) {
                const episodeUrl = `https://kamianime.club/anime/${tracker.anime_id}/episode/${currentAired}`;
                const googleRes = await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                  },
                  body: JSON.stringify({
                    url: episodeUrl,
                    type: 'URL_UPDATED'
                  })
                });
                console.log(`[Google Indexing] Pinged for ${tracker.title} (Status: ${googleRes.status})`);
              }
            } catch (gErr) {
              console.error(`[Google Indexing] Error pinging for ${tracker.title}:`, gErr);
            }
          }

          // Get subscribers
          const { results: subscribers } = await env.DB.prepare(
            "SELECT chat_id FROM telegram_subscriptions WHERE anime_id = ?"
          ).bind(tracker.anime_id).all();

          if (subscribers && subscribers.length > 0) {
            for (const sub of subscribers) {
              try {
                const text = `🎉 Вышла новая *${currentAired} серия* аниме!\n\n*${tracker.title}*\n\nПриятного просмотра на KamiAnime!`;
                const replyMarkup = JSON.stringify({
                  inline_keyboard: [[{ text: 'Смотреть', url: `https://kamianime.club/anime/${tracker.anime_id}/episode/${currentAired}` }]]
                });

                await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: sub.chat_id,
                    text: text,
                    parse_mode: 'Markdown',
                    reply_markup: replyMarkup
                  })
                });
              } catch (sendErr) {
                console.error(`Error sending to ${sub.chat_id}:`, sendErr);
              }
            }
          }
        }

        // 4. Cleanup finished anime
        try {
          const shikiRes = await fetch(`https://shikimori.one/api/animes/${tracker.anime_id}`);
          if (shikiRes.ok) {
            const shikiData = await shikiRes.json() as any;
            if (shikiData.status === 'released' && shikiData.episodes > 0 && currentAired >= shikiData.episodes) {
               console.log(`[CLEANUP] Anime ${tracker.title} is completed. Removing from tracker.`);
               await env.DB.prepare("DELETE FROM anime_episodes_tracker WHERE anime_id = ?").bind(tracker.anime_id).run();
               await env.DB.prepare("DELETE FROM telegram_subscriptions WHERE anime_id = ?").bind(tracker.anime_id).run();
            }
          }
        } catch (e) {
          console.error(`Error checking completion status for ${tracker.anime_id}:`, e);
        }
      } catch (err) {
        console.error(`Error checking anime ${tracker.anime_id}:`, err);
      }
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log('Telegram notifications check completed.');
  } catch (error) {
    console.error('Global Telegram check error:', error);
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    await runTelegramNotifications(context.env);
    return new Response('Telegram OK', { status: 200 });
  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
};

export const scheduled: ScheduledHandler<Env> = async (event, env, ctx) => {
  await runTelegramNotifications(env);
};
