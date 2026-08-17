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
    "SonyDTV", "LOEWE", "Vestel"
  ];

  return tvKeywords.some((kw) => new RegExp(kw, "i").test(ua));
};

export const isTvModeEnabled = (): boolean => {
  return false;
};

export const setTvMode = (_enabled: boolean) => {};

export const toggleTvMode = (): boolean => false;

export const applyTvModeClass = (_enabled: boolean) => {};

export const initTvSystem = () => {};

