interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const update: any = await request.json();

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text.startsWith('/start anime_')) {
        const animeId = text.split('_')[1];

        if (!animeId || isNaN(Number(animeId))) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Неверный формат ссылки.');
          return new Response('OK');
        }

        try {
          // 1. Fetch anime info from Shikimori
          const response = await fetch(`https://shikimori.one/api/animes/${animeId}`);
          if (!response.ok) throw new Error('Аниме не найдено');
          const anime = await response.json() as any;

          // 1.5 Fetch episodes from Kodik
          const kodikResponse = await fetch(`https://kodik-api.com/search?token=17cc4ee691bc251131a9041e6e89e78e&shikimori_id=${animeId}`);
          let episodesAired = anime.episodes_aired || 0;
          if (kodikResponse.ok) {
            const kodikData = await kodikResponse.json() as any;
            if (kodikData.results && kodikData.results.length > 0) {
              let maxEp = 0;
              for (const result of kodikData.results) {
                const ep = result.last_episode || result.episodes_count || 0;
                if (ep > maxEp) maxEp = ep;
              }
              if (maxEp > episodesAired) episodesAired = maxEp;
            }
          }

          // 2. Add subscription to D1
          const subId = crypto.randomUUID();
          await env.DB.prepare(
            `INSERT INTO telegram_subscriptions (id, chat_id, anime_id) 
             VALUES (?, ?, ?) 
             ON CONFLICT(chat_id, anime_id) DO NOTHING`
          ).bind(subId, chatId, animeId).run();

          // 3. Save current episodes if not exists
          await env.DB.prepare(
            `INSERT INTO anime_episodes_tracker (anime_id, title, episodes_aired) 
             VALUES (?, ?, ?) 
             ON CONFLICT(anime_id) DO NOTHING`
          ).bind(animeId, anime.russian || anime.name, episodesAired).run();

          await sendMessage(
            env.TELEGRAM_BOT_TOKEN, 
            chatId, 
            `✅ Вы успешно подписались на уведомления о выходе новых серий аниме:\n\n*${anime.russian || anime.name}*\n\nКак только выйдет новая серия, я сразу же вам напишу!`,
            'Markdown'
          );
        } catch (error) {
          console.error('Subscription error:', error);
          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Произошла ошибка при оформлении подписки. Попробуйте позже.');
        }
      } else if (text.startsWith('/addcode ') && chatId === 1444645703) {
        // Command for admin to add a new code: /addcode 405 59978
        const parts = text.split(' ');
        if (parts.length >= 3) {
          const code = parts[1];
          const animeId = parts[2];
          
          try {
            await env.DB.prepare(
              `INSERT INTO anime_codes (code, anime_id) VALUES (?, ?) ON CONFLICT(code) DO UPDATE SET anime_id = ?`
            ).bind(code, animeId, animeId).run();
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Код ${code} успешно привязан к аниме ID ${animeId}`);
          } catch (e: any) {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Ошибка при добавлении кода: ${e.message}\n(Возможно, таблица anime_codes еще не создана)`);
          }
        } else {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Использование: /addcode <код> <ID_аниме>`);
        }
      } else if (text.startsWith('/stats') && chatId === 1444645703) {
        try {
          // Get total usages
          const totalUsages = await env.DB.prepare("SELECT COUNT(*) as count FROM code_usage_stats").first();
          
          // Get top 5 codes
          const topCodes = await env.DB.prepare(`
            SELECT code, COUNT(*) as count 
            FROM code_usage_stats 
            GROUP BY code 
            ORDER BY count DESC 
            LIMIT 5
          `).all();

          // Get unique users
          const uniqueUsers = await env.DB.prepare("SELECT COUNT(DISTINCT chat_id) as count FROM code_usage_stats").first();

          let statsText = `📊 *Статистика использования кодов*\n\n`;
          statsText += `Всего запросов: *${(totalUsages as any)?.count || 0}*\n`;
          statsText += `Уникальных пользователей: *${(uniqueUsers as any)?.count || 0}*\n\n`;
          
          if (topCodes.results && topCodes.results.length > 0) {
            statsText += `🏆 *Топ 5 кодов:*\n`;
            topCodes.results.forEach((row: any, index: number) => {
              statsText += `${index + 1}. Код \`${row.code}\` — ${row.count} раз(а)\n`;
            });
          } else {
            statsText += `Пока нет данных о популярных кодах.`;
          }

          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, statsText, 'Markdown');
        } catch (e: any) {
          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Ошибка при получении статистики: ${e.message}`);
        }
      } else if (/^\d+$/.test(text) || text.startsWith('код') || text.startsWith('Код')) {
        // User sent a code (numbers only, or "код 405")
        const codeMatch = text.match(/\d+/);
        if (codeMatch) {
          const code = codeMatch[0];
          try {
            const codeRecord = await env.DB.prepare("SELECT anime_id FROM anime_codes WHERE code = ?").bind(code).first();
            if (codeRecord) {
              const animeId = codeRecord.anime_id;
              const url = `https://kamianime.club/anime/${animeId}`;
              
              // Record usage
              const statId = crypto.randomUUID();
              await env.DB.prepare(
                `INSERT INTO code_usage_stats (id, code, chat_id) VALUES (?, ?, ?)`
              ).bind(statId, code, chatId).run();

              await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: '🎬 Твое аниме найдено! Приятного просмотра:',
                  reply_markup: {
                    inline_keyboard: [[{ text: '🍿 Смотреть', url: url }]]
                  }
                })
              });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Аниме по этому коду не найдено. Проверьте правильность кода.');
            }
          } catch (e) {
            console.error('Error fetching code:', e);
          }
        }
      } else if (text === '/start') {
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN, 
          chatId, 
          'Привет! Я бот KamiAnime 🌸\n\n🍿 *Ищешь аниме из TikTok/Shorts?*\nПросто отправь мне код (например, 405)!\n\n🔔 *Хочешь получать уведомления о новых сериях?*\nПерейди на наш сайт kamianime.club, выбери онгоинг и нажми "Уведомлять о сериях".',
          'Markdown'
        );
      } else {
        // Fallback for unknown commands/text
        await sendMessage(
          env.TELEGRAM_BOT_TOKEN, 
          chatId, 
          'Я не совсем понял 😅\n\nЕсли ищешь аниме по коду из видео — просто отправь мне цифры (например, 405).\n\nЕсли хочешь получать уведомления о выходе серий, перейди на сайт kamianime.club и нажми "Уведомлять о сериях" на странице аниме.'
        );
      }
    }

    return new Response('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};

async function sendMessage(token: string, chatId: number, text: string, parseMode?: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body: any = {
    chat_id: chatId,
    text: text,
  };
  if (parseMode) {
    body.parse_mode = parseMode;
  }

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
