import { execSync } from 'child_process';
import fs from 'fs';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'qwen2.5:7b';
const SLEEP_BETWEEN_BATCHES = 500;
const BATCH_DB_SIZE = 1;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. Получаем описание с Shikimori
async function getRealDescription(id: number) {
  try {
    const response = await fetch(`https://shikimori.one/api/animes/${id}`);
    if (!response.ok) return null;
    const data = await response.json() as any;
    if (!data.description) return null;
    return data.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch { return null; }
}

// 2. Переписываем описание через Ollama
async function rewriteDescription(text: string, title: string) {
  const prompt = `Перепиши это описание аниме "${title}" уникально для SEO, сохранив сюжет и факты. Пиши развернуто (до 150 слов) на русском языке.
  
  Оригинал: ${text.substring(0, 800)}
  
  Уникальное описание:`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      body: JSON.stringify({
        model: MODEL,
        system: "Ты — SEO-копирайтер. Пиши уникально, подробно, по существу.",
        prompt: prompt,
        stream: false,
        options: { temperature: 0.4, num_predict: 500 }
      })
    });
    const data = await response.json() as any;
    return data.response.trim();
  } catch { return text.substring(0, 300); }
}

async function run() {
  console.log('🚀 Запуск: Загрузка + Уникализация SEO...');

  let page = 1;
  while (page <= 400) {
    console.log(`\n--- Страница ${page} ---`);
    
    try {
      const res = await fetch(`https://shikimori.one/api/animes?limit=50&order=popularity&page=${page}`);
      const animeList = await res.json() as any[];
      if (!animeList || animeList.length === 0) break;

      const animeIds = animeList.map(a => a.id).join(',');
      const query = `SELECT anime_id FROM anime_seo WHERE anime_id IN (${animeIds})`;
      const d1Output = execSync(`npx wrangler d1 execute anime_db --remote --json --command "${query}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      
      const jsonMatch = d1Output.match(/\[.*\]/s);
      const existingIds = new Set();
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const rows = result[0]?.results || [];
        rows.forEach((r: any) => existingIds.add(String(r.anime_id)));
      }

      const toProcess = animeList.filter(a => !existingIds.has(String(a.id)));
      console.log(`Найдено ${toProcess.length} новых аниме.`);

      const sqlStatements: string[] = [];

      for (const anime of toProcess) {
        console.log(`Обработка: ${anime.russian || anime.name}...`);
        const original = await getRealDescription(anime.id);
        
        if (original) {
          const uniqueSeo = await rewriteDescription(original, anime.russian || anime.name);
          const safeSeo = uniqueSeo.replace(/'/g, "''");
          sqlStatements.push(`INSERT OR IGNORE INTO anime_seo (anime_id, seo_description, is_seo_generated) VALUES (${anime.id}, '${safeSeo}', 1);`);
          console.log(`✅ Уникализировано: ${anime.id}.`);
        }

        // Если накопили пачку или это последнее аниме - записываем в БД
        if (sqlStatements.length >= BATCH_DB_SIZE || anime === toProcess[toProcess.length - 1]) {
          if (sqlStatements.length > 0) {
            console.log(`🚀 Записываю в БД ${sqlStatements.length} описаний...`);
            fs.writeFileSync('temp_query.sql', sqlStatements.join('\n'));
            
            // Убираем stdio: ignore, чтобы видеть ошибки wrangler
            const output = execSync(`npx wrangler d1 execute anime_db --remote --file=temp_query.sql`).toString();
            console.log('Ответ Wrangler:', output);
            
            fs.unlinkSync('temp_query.sql');
            console.log(`✅ Успешно записано.`);
            sqlStatements.length = 0;
          }
        }
        await sleep(SLEEP_BETWEEN_BATCHES);
      }
    } catch (err) { console.error('Ошибка:', err); }
    page++;
  }
}

run();
