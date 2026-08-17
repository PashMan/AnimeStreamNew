export async function generateAnimeSeoDescription(anime: { title: string, originalName: string, genres: string[], description: string, year: number }, customApiKey?: string) {
  try {
    const response = await fetch('/api/generate-seo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ anime, apiKey: customApiKey }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Ошибка генерации SEO через API:", errorData.error);
      return null;
    }

    const data = await response.json();
    return data.seoDescription;
  } catch (error) {
    console.error("Ошибка сети при генерации SEO:", error);
    return null;
  }
}
