/**
 * Utility function to generate clean, non-nested /api/media/playlist URLs
 */
export function getCleanPlaylistUrl(
  rawUrl: string, 
  fallbackUrl?: string | null, 
  quality?: string | number | null,
  resolve: boolean = false
): string {
  if (!rawUrl && !fallbackUrl) return '';

  let cleanTarget = rawUrl || fallbackUrl || '';

  // 1. Безопасное извлечение оригинального URL (с сохранением &parent и &episode)
  if (cleanTarget.includes('/api/media/playlist')) {
    // Извлекаем все содержимое после url= до конца строки или до следующего верхнеуровневого параметра (&fallback_url=)
    const urlMatch = cleanTarget.match(/[?&]url=([^&]+(?:[?&%].*)?)/i);
    if (urlMatch) {
      let extracted = urlMatch[1];
      if (extracted.includes('&fallback_url=')) {
        extracted = extracted.split('&fallback_url=')[0];
      }
      if (extracted.includes('&resolve=')) {
        extracted = extracted.split('&resolve=')[0];
      }
      if (extracted.includes('&quality=')) {
        extracted = extracted.split('&quality=')[0];
      }
      cleanTarget = extracted;
    }
  }

  // 2. Снимаем только внешние слои кодирования (двойной %25), не ломая внутренние слеши
  for (let i = 0; i < 3; i++) {
    if (cleanTarget.includes('%25') || cleanTarget.startsWith('%2F') || cleanTarget.startsWith('%3F')) {
      try {
        const next = decodeURIComponent(cleanTarget);
        if (next === cleanTarget) break;
        cleanTarget = next;
      } catch (_) {
        break;
      }
    } else {
      break;
    }
  }

  // 3. Обработка fallbackUrl
  let cleanFallback = fallbackUrl || '';
  if (cleanFallback && cleanFallback.includes('/api/media/playlist')) {
    const fMatch = cleanFallback.match(/[?&]url=([^&]+)/i);
    if (fMatch) cleanFallback = fMatch[1];
  }

  const params = new URLSearchParams();
  params.set('url', cleanTarget);

  if (cleanFallback && cleanFallback !== cleanTarget) {
    params.set('fallback_url', cleanFallback);
  }
  if (resolve) {
    params.set('resolve', 'true');
  }
  if (quality) {
    params.set('quality', String(quality).replace('p', ''));
  }

  return `/api/media/playlist?${params.toString()}`;
}