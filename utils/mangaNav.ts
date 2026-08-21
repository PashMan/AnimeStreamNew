export function openMangaPage(searchTitle?: string, episode?: number | string, chapter?: number | string) {
  const params = new URLSearchParams();
  if (searchTitle) params.set('search', searchTitle);
  if (episode) params.set('episode', String(episode));
  if (chapter) params.set('chapter', String(chapter));

  const qs = params.toString() ? `?${params.toString()}` : '';

  if (typeof window !== 'undefined' && window.location.hostname.includes('kamianime.club')) {
    window.location.href = `https://manga.kamianime.club/${qs}`;
  } else {
    window.location.href = `/manga${qs}`;
  }
}
