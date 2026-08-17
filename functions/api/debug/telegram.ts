export const onRequest: PagesFunction<any> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === 'true';
  const testMsg = url.searchParams.get('testMsg') === 'true';

  try {
    // 1. Check DB tables
    const { results: trackers } = await env.DB.prepare("SELECT * FROM anime_episodes_tracker").all();
    const { results: subs } = await env.DB.prepare("SELECT * FROM telegram_subscriptions").all();

    let debugInfo: any = {
      status: "ok",
      telegram_bot_token_configured: !!env.TELEGRAM_BOT_TOKEN,
      trackers,
      subscriptions: subs,
      kodik_analysis: [],
      logs: []
    };

    // 2. Check Kodik for tracked animes
    if (trackers && trackers.length > 0) {
      for (const t of trackers) {
        try {
          const res = await fetch(`https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&shikimori_id=${t.anime_id}`);
          const text = await res.text();
          
          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            debugInfo.kodik_analysis.push({
              anime_id: t.anime_id,
              title: t.title,
              error: "Failed to parse JSON",
              raw_response: text,
              status: res.status
            });
            continue;
          }
          
          let currentAired = 0;
          let episodesList = [];
          
          if (data.results && data.results.length > 0) {
             for (const r of data.results) {
               const ep = r.last_episode || r.episodes_count || 0;
               episodesList.push({ translation: r.translation?.title, episode: ep });
               if (ep > currentAired) currentAired = ep;
             }
          } else {
             console.log(`No results for ${t.anime_id}. Raw response: ${text}`);
          }
          
          debugInfo.kodik_analysis.push({
            anime_id: t.anime_id,
            title: t.title,
            db_episodes_aired: t.episodes_aired,
            kodik_max_episode_found: currentAired,
            will_trigger_notification: currentAired > (t.episodes_aired as number),
            kodik_raw_episodes: episodesList,
            raw_response_snippet: text.substring(0, 100) // Added snippet to debug output
          });
        } catch (err: any) {
          debugInfo.kodik_analysis.push({ anime_id: t.anime_id, error: err.message });
        }
      }
    }

    // 3. Force update if requested (decrements episodes_aired by 1 to simulate a new episode)
    if (force) {
      await env.DB.prepare("UPDATE anime_episodes_tracker SET episodes_aired = episodes_aired - 1").run();
      debugInfo.logs.push("✅ УСПЕШНО: Счетчик серий в базе (episodes_aired) уменьшен на 1. Теперь при запуске крона бот подумает, что вышла новая серия.");
    }

    // 4. Test message if requested
    if (testMsg) {
      if (!env.TELEGRAM_BOT_TOKEN) {
        debugInfo.logs.push("❌ ОШИБКА: TELEGRAM_BOT_TOKEN не настроен в переменных окружения.");
      } else if (!subs || subs.length === 0) {
        debugInfo.logs.push("❌ ОШИБКА: Нет подписчиков в таблице telegram_subscriptions. Сначала подпишитесь на сайте.");
      } else {
        const sub = subs[0];
        const botToken = env.TELEGRAM_BOT_TOKEN;
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: sub.chat_id,
              text: '🛠 Тестовое сообщение из дебаггера. Связь с Telegram работает отлично!'
            })
          });
          const tgData = await tgRes.json();
          debugInfo.logs.push({ test_message_result: tgData });
        } catch (err: any) {
          debugInfo.logs.push({ test_message_error: err.message });
        }
      }
    }

    return new Response(JSON.stringify(debugInfo, null, 2), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
};
