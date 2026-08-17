import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { clearRequestQueue } from '../services/shikimori';

const ScrollToTop = () => {
  const { pathname } = useLocation();
  const prevGroupKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Extract base group identifier to avoid scrolling to top when navigating episodes of the same anime
    const animeMatch = pathname.match(/^\/anime\/([^/]+)/);
    const scrollGroupKey = animeMatch ? `anime:${animeMatch[1]}` : pathname;

    if (prevGroupKeyRef.current !== scrollGroupKey) {
      // Automatic scroll removed per user request: only human scrolling
      prevGroupKeyRef.current = scrollGroupKey;
    }

    clearRequestQueue();
    
    // Send pageview to Google Analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('config', 'G-LVD0M2PPJN', {
        page_path: pathname,
      });
    }
  }, [pathname]);

  return null;
};

export default ScrollToTop;
