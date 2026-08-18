/**
 * Smart TV Device Helper
 */

export const isTvDevice = (): boolean => {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;

  const ua = navigator.userAgent || "";
  
  // Specific Smart TV identifiers in User-Agent
  const tvKeywords = [
    "SmartTV", "Tizen", "Web0S", "WebOS", "VIDAA", "Vidaa",
    "Android TV", "AFTT", "AFTM", "AFTA", "AFTB", "FireTV", "HbbTV",
    "AppleTV", "BRAVIA", "NetCast", "GoogleTV", "Opera TV", "Viera",
    "SmartHub", "DuneHD", "MAG250", "MiTV", "Hisense",
    "SonyDTV", "LOEWE", "Vestel", "Large Screen", "TV"
  ];

  const isMatched = tvKeywords.some((kw) => new RegExp(kw, "i").test(ua));
  const isLargeLandscape = typeof window !== "undefined" && window.innerWidth >= 1280 && window.innerHeight >= 720;
  
  return isMatched || (isMatched && isLargeLandscape);
};

export const applyTvModeClass = (enabled: boolean) => {
  if (typeof document === "undefined") return;
  if (enabled) {
    document.documentElement.style.fontSize = '22px';
    document.documentElement.classList.add('tv-mode');
  } else {
    document.documentElement.style.fontSize = '';
    document.documentElement.classList.remove('tv-mode');
  }
};

export const initTvSystem = () => {
  if (typeof window === "undefined") return;
  if (isTvDevice()) {
    applyTvModeClass(true);
  }
};


