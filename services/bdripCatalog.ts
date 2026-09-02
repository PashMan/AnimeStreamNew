export interface BDRipSubtitle {
  url: string;
  label: string;
  lang: string;
  default?: boolean;
}

export interface BDRipAnime {
  shikimoriId: string;
  aliases?: string[];
  title: string;
  badge: 'KamiBDRip' | string;
  qualityLabel: string;
  isMovie?: boolean;
  is4K?: boolean;
  totalEpisodes?: number;
  defaultAudioTrackNames: string[];
  maxAudioTracks?: number;
  getStreamUrl: (episodeNumber?: number) => string;
  getSubtitles?: (episodeNumber?: number) => BDRipSubtitle[];
}

/**
 * Единый реестр релизов максимального качества (KamiBDRip / 4K) с хранилища R2.
 * Чтобы добавить новое аниме, достаточно добавить запись с его shikimoriId.
 */
export const BDRIP_CATALOG: Record<string, BDRipAnime> = {
  // Человек-бензопила (Chainsaw Man)
  '44511': {
    shikimoriId: '44511',
    title: 'Человек-бензопила',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: false,
    is4K: true,
    totalEpisodes: 12,
    defaultAudioTrackNames: [
      'Японский (Оригинал)',
      'Crunchyroll (Дубляж)',
      'Studio Band',
      'Flarrow Films',
      'Dream Cast',
      'AniDUB',
    ],
    getStreamUrl: (ep = 1) => {
      const epStr = String(ep).padStart(2, '0');
      return `https://cdn1.kamianime.club/chainsaw_man/ep${epStr}/index.m3u8`;
    },
    getSubtitles: (ep = 1) => {
      const epStr = String(ep).padStart(2, '0');
      return [
        {
          url: `https://cdn1.kamianime.club/chainsaw_man/ep${epStr}/sub_rus_${epStr}.vtt`,
          label: 'Русские субтитры',
          lang: 'ru',
          default: true,
        },
        {
          url: `https://cdn1.kamianime.club/chainsaw_man/ep${epStr}/sub_eng_${epStr}.vtt`,
          label: 'English Subtitles',
          lang: 'en',
        },
      ];
    },
  },

  // Судзумэ, закрывающая двери
  '50594': {
    shikimoriId: '50594',
    aliases: ['62568'],
    title: 'Судзумэ, закрывающая двери',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: true,
    is4K: true,
    totalEpisodes: 1,
    defaultAudioTrackNames: [
      'Bravo Records',
      'Flarrow Films',
      'TVShows',
      'Leviafilm',
      'AniLibria',
    ],
    getStreamUrl: () => 'https://cdn1.kamianime.club/suzume/master.m3u8',
  },
  '62568': {
    shikimoriId: '62568',
    title: 'Судзумэ, закрывающая двери',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: true,
    is4K: true,
    totalEpisodes: 1,
    defaultAudioTrackNames: [
      'Bravo Records',
      'Flarrow Films',
      'TVShows',
      'Leviafilm',
      'AniLibria',
    ],
    getStreamUrl: () => 'https://cdn1.kamianime.club/suzume/master.m3u8',
  },

  // Дитя погоды
  '38826': {
    shikimoriId: '38826',
    title: 'Дитя погоды',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: true,
    is4K: true,
    totalEpisodes: 1,
    defaultAudioTrackNames: [
      'Reanimedia (Дубляж)',
      'Flarrow Films',
      'AniLibria',
      'Оригинал + Субтитры',
      'Оригинал',
    ],
    getStreamUrl: () => 'https://cdn1.kamianime.club/weathering/master.m3u8',
  },

  // Сад изящных слов
  '16782': {
    shikimoriId: '16782',
    title: 'Сад изящных слов',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: true,
    is4K: true,
    totalEpisodes: 1,
    defaultAudioTrackNames: [
      'Reanimedia (Дубляж)',
      'AniLibria',
      'Оригинал + Субтитры',
      'Оригинал',
    ],
    getStreamUrl: () => 'https://cdn1.kamianime.club/garden_of_words/master.m3u8',
  },

  // Твоё имя
  '32281': {
    shikimoriId: '32281',
    title: 'Твоё имя',
    badge: 'KamiBDRip',
    qualityLabel: 'KamiBDRip (Blu-Ray Master)',
    isMovie: true,
    is4K: true,
    totalEpisodes: 1,
    defaultAudioTrackNames: [
      'Мосфильм-Мастер (Дубляж)',
      'Reanimedia',
      'AniLibria',
      'Оригинал + Субтитры',
      'Оригинал',
    ],
    getStreamUrl: () => 'https://cdn.kamianime.club/kimi-no-na-wa/master.m3u8',
  },
};

/**
 * Проверяет, доступен ли для данного аниме релиз максимального качества BDRip
 */
export const isBDRipAvailable = (shikimoriId?: string | number | null): boolean => {
  if (!shikimoriId) return false;
  const idStr = String(shikimoriId);
  return Boolean(BDRIP_CATALOG[idStr]);
};

/**
 * Получить конфигурацию релиза BDRip по shikimoriId
 */
export const getBDRipRelease = (shikimoriId?: string | number | null): BDRipAnime | undefined => {
  if (!shikimoriId) return undefined;
  const idStr = String(shikimoriId);
  return BDRIP_CATALOG[idStr];
};

/**
 * Список всех уникальных Shikimori ID тайтлов из каталога R2 BDRip
 */
export const getAllBDRipShikimoriIds = (): string[] => {
  return Object.keys(BDRIP_CATALOG).filter((id) => id !== '62568');
};
