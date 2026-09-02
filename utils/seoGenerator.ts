/**
 * Utility for generating highly optimized long-tail SEO metadata
 * and page text templates to capture low-frequency search traffic (НЧ-запросы).
 */

interface SEOData {
  title: string;
  description: string;
  keywords: string;
  h1Text: string;
  promoText: string;
}

/**
 * Extracts the season number from an anime title.
 * E.g., "Клинок рассекающий демонов 3 сезон" -> 3
 */
export function extractSeasonNumber(title: string): number {
  if (!title) return 1;

  // Search for direct Russian representations "X сезон", "сезон X"
  const ruSeasonMatch = title.match(/(\d+)\s*(?:сезон|season)/i);
  if (ruSeasonMatch) return parseInt(ruSeasonMatch[1], 10);

  // Roman numerals
  if (/\bX\b/i.test(title)) return 10;
  if (/\bIX\b/i.test(title)) return 9;
  if (/\bVIII\b/i.test(title)) return 8;
  if (/\bVII\b/i.test(title)) return 7;
  if (/\bVI\b/i.test(title)) return 6;
  if (/\bV\b/i.test(title)) return 5;
  if (/\bIV\b/i.test(title)) return 4;
  if (/\bIII\b/i.test(title)) return 3;
  if (/\bII\b/i.test(title)) return 2;

  // Search for trailing lone digits which usually signify seasons, e.g. "Магическая битва 2"
  const endNumMatch = title.match(/\b([2-9])\b\s*$/);
  if (endNumMatch) return parseInt(endNumMatch[1], 10);

  return 1;
}

/**
 * Strips existing season mentions from the base title to prevent duplication
 * (e.g. "Клинок рассекающий демонов 3 сезон" -> "Клинок рассекающий демонов")
 */
export function getBaseAnimeTitle(title: string): string {
  if (!title) return "";
  let base = title;
  
  // Remove "N сезон", "сезон N"
  base = base.replace(/\d+\s*(?:сезон|season)/i, "");
  // Remove Roman numerals at the end
  base = base.replace(/\s+\b(?:X|IX|VIII|VII|VI|V|IV|III|II|I)\b\s*$/i, "");
  // Remove dangling numbers at the end
  base = base.replace(/\s+\b[2-9]\b\s*$/, "");
  
  return base.trim();
}

/**
 * Generates custom SEO tags, detailed template texts, and optimized keywords
 */
export function generateAnimeSEO(
  title: string,
  originalName: string = "",
  year: string | number = "",
  genres: string[] = [],
  description: string = "",
  paramEpisode?: string
): SEOData {
  const season = extractSeasonNumber(title);
  const baseTitle = getBaseAnimeTitle(title);
  const seasonSuffix = season > 1 ? `${season} сезон` : `1 сезон`;
  const formatYear = year ? ` (${year})` : "";

  // 1. Optimized Title Tag (Title)
  let seoTitle = "";
  if (paramEpisode) {
    seoTitle = `Смотреть ${baseTitle} ${seasonSuffix} — ${paramEpisode} серия в Full HD онлайн или скачать в mp4 бесплатно`;
  } else {
    seoTitle = `Смотреть аниме ${baseTitle} ${seasonSuffix} в Full HD онлайн бесплатно или скачать все серии в mp4`;
  }

  // 2. Optimized H1 Header
  const h1Text = paramEpisode
    ? `Смотреть аниме ${baseTitle} — ${seasonSuffix} ${paramEpisode} серия в 1080p`
    : `Смотреть аниме ${baseTitle} ${seasonSuffix} онлайн в Full HD 1080p`;

  // 3. Dynamic SEO-Optimized Template description
  // Target low-frequency long tails: "без всплывающей рекламы ставок", "озвучки Анилибрия, DEEP", "в какой озвучке лучше смотреть"
  const cleanDesc = description 
    ? description.replace(/<[^>]*>/g, "").slice(0, 150)
    : `Увлекательное аниме в жанре ${genres.length > 0 ? genres.slice(0, 2).join(", ") : "приключения"}. Оцените потрясающий сюжет и любимых персонажей на KamiAnime.`;

  const seoDescription = paramEpisode
    ? `Смотреть и скачать ${paramEpisode}-ю серию аниме ${baseTitle} ${seasonSuffix} в mp4 формате онлайн на телефон или ПК без рекламы. В какой озвучке лучше смотреть? Доступны дубляж Анилибрия, DEEP, оригинальная дорожка с русскими субтитрами и другие топовые релизы.`
    : `Смотреть или скачать аниме ${baseTitle} ${seasonSuffix}${formatYear} все серии на телефон и ПК в хорошем качестве .mp4 бесплатно и без рекламы. Узнайте отзывы, в какой озвучке лучше смотреть (${genres.slice(0, 3).join(", ")}) на KamiAnime!`;

  // 4. Promo Text block to render on the page for SEO crawlers (and users wishing to know where to watch)
  const promoText = `Смотреть аниме «${baseTitle}» в Full HD качестве онлайн или скачать напрямую в .mp4 на телефон и ПК — это лучший способ погрузиться в захватывающий сюжет проекта${formatYear}. Мы позаботились о вашем комфорте: у нас вы можете смотреть или скачать любимый тайтл полностью бесплатно и без всплывающей рекламы ставок. Нужна конкретная серия? С помощью быстрого скачивания вы можете за секунды получить любимую серию в формате MP4 для просмотра офлайн. Сомневаетесь, в какой озвучке лучше смотреть? Мы собрали все лучшие релиз-группы на одной странице! Вас ждут озвучки Анилибрия (Anilibria), DEEP, JAM Club, а также оригинальная японская аудиодорожка с качественными русскими субтитрами. Наслаждайтесь плавным просмотром абсолютно бесплатно на KamiAnime!`;

  // 5. Long-tail Keywords setup for SEO bots
  const normTitle = baseTitle.toLowerCase();
  const baseKeywords = [
    `скачать ${normTitle} в mp4`,
    `скачать аниме ${normTitle} бесплатно`,
    `скачать аниме ${normTitle} все серии`,
    `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()}`,
    `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()} все серии`,
    `скачать ${normTitle} на телефон`,
    `скачать и смотреть ${normTitle} все серии`,
    `скачать торрент ${normTitle}`,
    `смотреть ${normTitle} в full hd качестве`,
    `аниме ${normTitle} смотреть онлайн 1080p`,
    `${normTitle} ${seasonSuffix.toLowerCase()} в full hd`,
    `${normTitle} в какой озвучке лучше смотреть`,
    `смотреть ${normTitle} бесплатно без рекламы казино`,
    `аниме ${normTitle} без ставок`,
    `${normTitle} анилибрия deep смотреть онлайн`,
    normTitle,
    originalName.toLowerCase()
  ];

  if (paramEpisode) {
    // Extract just the digit from the episode (e.g. "5 серия" -> "5")
    const epDigitMatch = paramEpisode.match(/\d+/);
    const epDigit = epDigitMatch ? epDigitMatch[0] : paramEpisode;
    
    baseKeywords.unshift(
      `скачать аниме ${normTitle} ${epDigit} серия`,
      `скачать аниме ${normTitle} ${epDigit} серия в mp4`,
      `скачать аниме ${normTitle} ${epDigit} серия на телефон`,
      `скачать аниме ${normTitle} ${epDigit} серия бесплатно`,
      `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()} ${epDigit} серия`,
      `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()} ${epDigit} серия в хорошем качестве`,
      `скачать ${normTitle} ${paramEpisode} серия в mp4`,
      `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()} ${paramEpisode} серия на телефон`,
      `смотреть ${normTitle} ${seasonSuffix.toLowerCase()} ${paramEpisode} серия 1080p`,
      `${normTitle} ${paramEpisode} серия без рекламы`
    );
  } else {
    baseKeywords.unshift(
      `скачать все серии ${normTitle} в хорошем качестве`,
      `скачать аниме ${normTitle} ${seasonSuffix.toLowerCase()} в mp4`,
      `скачать аниме ${normTitle} 1 серия`,
      `скачать аниме ${normTitle} 2 серия`,
      `скачать аниме ${normTitle} последняя серия`
    );
  }

  const seoKeywords = baseKeywords.join(", ");

  return {
    title: seoTitle,
    description: seoDescription,
    keywords: seoKeywords,
    h1Text,
    promoText
  };
}
