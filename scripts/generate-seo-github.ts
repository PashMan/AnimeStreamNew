import { GoogleGenAI } from "@google/genai";
import { execSync } from 'child_process';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set. Please set it in your GitHub Secrets.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const SLEEP_MS = 5000;
const MAX_RUNTIME_MS = 5 * 60 * 60 * 1000;
const startTime = Date.now();

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runSeoGeneration() {
  console.log('Starting continuous SEO generation with Gemini...');

  while (Date.now() - startTime < MAX_RUNTIME_MS) {
    console.log('--- Starting new batch ---');
    
    let toProcess: any[] = [];
    // Ищем глубже: до 50 страниц (2500 аниме)
    for (let page = 1; page <= 50; page++) {
      const response = await fetch(`https://shikimori.one/api/animes?limit=50&order=popularity&page=${page}`);
      const animeListFromApi = await response.json() as any[];
      
      const animeIds = animeListFromApi.map(a => a.id).join(',');
      const query = `SELECT anime_id FROM anime_seo WHERE anime_id IN (${animeIds})`;
      const d1Output = execSync(`npx wrangler d1 execute anime_db --remote --json --command "${query}"`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
      const jsonMatch = d1Output.match(/\[.*\]/s);
      if (!jsonMatch) continue;
      
      const existingSeo = JSON.parse(jsonMatch[0]);
      const existingIds = new Set(
        existingSeo
          .flatMap((r: any) => r.results || [])
          .map((r: any) => r.anime_id)
      );
      
      const pageToProcess = animeListFromApi.filter(a => !existingIds.has(String(a.id)));
      toProcess.push(...pageToProcess);
      if (toProcess.length >= 20) break;
    }
    
    toProcess = toProcess.slice(0, 5);

    if (toProcess.length === 0) {
      console.log('No more anime to process. Finishing.');
      break;
    }

    const animeList = toProcess.map((a: any) => ({
      id: a.id,
      title: a.russian || a.name
    }));

    const prompt = `Ты — эксперт по аниме и топовый SEO-копирайтер.
    Твоя задача: написать ГЛУБОКОЕ, ИММЕРСИВНОЕ описание для аниме.
    
    СТРОГИЕ ПРАВИЛА:
    1. НИКАКИХ шаблонных фраз типа "аниме-экшен", "аниме-романтика", "история о...".
    2. Пиши живо, как будто советуешь другу. Используй эмоции, интригу, делись впечатлениями.
    3. Обязательно впиши название аниме в текст.
    4. Описание должно быть уникальным, ДЕТАЛЬНЫМ, погружающим в атмосферу.
    5. Объем: МИНИМУМ 150 слов. НЕ СОКРАЩАЙ! Раскрой сюжет, опиши атмосферу, персонажей, их мотивацию.
    6. Верни ТОЛЬКО JSON массив: [{"id": 123, "seo": "текст"}].
    
    Список аниме:
    ${JSON.stringify(animeList)}`;

    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });

      const rawContent = result.text;
      if (!rawContent) continue;
      
      // Ищем JSON массив в тексте (даже если там есть лишний текст или ```json)
      const jsonMatch = rawContent.match(/\[\s*\{.*\}\s*\]/s);
      if (!jsonMatch) {
        console.error('AI returned invalid format (no JSON array found):', rawContent);
        continue;
      }
      
      let batchResults;
      try {
        batchResults = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Failed to parse JSON even after extraction:', jsonMatch[0]);
        continue;
      }

      const validItems = batchResults.filter((item: any) => item.id && item.seo);
      if (validItems.length > 0) {
        const values = validItems.map((item: any) => 
          `(${Math.floor(item.id)}, '${item.seo.replace(/'/g, "''")}', 1)`
        ).join(',');
        
        const insertQuery = `INSERT OR IGNORE INTO anime_seo (anime_id, seo_description, is_seo_generated) VALUES ${values}`;
        
        console.log('Executing SQL:', insertQuery);
        const dbResult = execSync(`npx wrangler d1 execute anime_db --remote --json --command "${insertQuery}"`).toString();
        console.log('DB Response:', dbResult);
        console.log(`Added ${validItems.length} items to DB`);
      }
    } catch (error: any) {
      if (error?.status === 429) {
        console.warn('Rate limit reached (429). Sleeping for 1 minute...');
        await sleep(60 * 1000);
      } else {
        console.error('Generation Error:', error);
        await sleep(SLEEP_MS);
      }
    }
    
    await sleep(SLEEP_MS);
  }
}

runSeoGeneration();
