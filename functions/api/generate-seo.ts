import Groq from 'groq-sdk';

interface Env {
  GROQ_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await request.json() as any;
  const { anime, apiKey } = body;

  const finalApiKey = apiKey || env.GROQ_API_KEY;

  if (!finalApiKey) {
    return new Response('API Key missing', { status: 400 });
  }

  const groq = new Groq({ apiKey: finalApiKey });

  const prompt = `Ты — эксперт по SEO для аниме-сайтов. Напиши захватывающее SEO-описание для аниме "${anime.title}" (${anime.originalName}, ${anime.year}).
  Жанры: ${anime.genres.join(', ')}.
  Краткий сюжет: ${anime.description}.
  
  Требования к описанию:
  1. Уникальное и привлекательное (не копируй исходный сюжет слово в слово).
  2. Содержит ключевые слова, связанные с жанрами и названием.
  3. Объем: 100-150 слов.
  4. В конце добавь призыв к действию: "Смотреть аниме ${anime.title} онлайн в хорошем качестве на нашем сайте".
  
  Верни ТОЛЬКО текст описания, без лишних комментариев, разметок или кавычек.`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
    });
    
    const content = response.choices[0]?.message?.content?.trim();
    return new Response(JSON.stringify({ seoDescription: content }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
