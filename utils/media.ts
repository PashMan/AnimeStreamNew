/**
 * Utility function to generate clean, non-nested /api/media/playlist URLs
 */
export function getCleanPlaylistUrl(rawUrl: string, fallbackUrl?: string | null, quality?: string | null): string {
  if (!rawUrl) return '';

  let cleanTarget = rawUrl;

  // Unwrap if rawUrl is already a /api/media/playlist URL
  while (cleanTarget.includes('/api/media/playlist') && cleanTarget.includes('url=')) {
    try {
      const urlObj = new URL(cleanTarget, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      const nested = urlObj.searchParams.get('url');
      if (nested) {
        cleanTarget = nested;
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }

  // Decode nested percent encodings
  while (cleanTarget.includes('%25') || cleanTarget.includes('%3A') || cleanTarget.includes('%2F')) {
    try {
      const next = decodeURIComponent(cleanTarget);
      if (next === cleanTarget) break;
      cleanTarget = next;
    } catch (_) {
      break;
    }
  }

  let cleanFallback = fallbackUrl || '';
  if (cleanFallback) {
    while (cleanFallback.includes('/api/media/playlist') && cleanFallback.includes('url=')) {
      try {
        const urlObj = new URL(cleanFallback, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
        const nested = urlObj.searchParams.get('url');
        if (nested) {
          cleanFallback = nested;
        } else {
          break;
        }
      } catch (_) {
        break;
      }
    }
    while (cleanFallback.includes('%25') || cleanFallback.includes('%3A') || cleanFallback.includes('%2F')) {
      try {
        const next = decodeURIComponent(cleanFallback);
        if (next === cleanFallback) break;
        cleanFallback = next;
      } catch (_) {
        break;
      }
    }
  }

  const params = new URLSearchParams();
  params.set('url', cleanTarget);
  if (cleanFallback) {
    params.set('fallback_url', cleanFallback);
  }
  params.set('resolve', 'true');
  if (quality) {
    params.set('quality', quality);
  }

  return `/api/media/playlist?${params.toString()}`;
}
