import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  BookOpen, Star, ArrowLeft, ChevronRight, ChevronLeft, Heart, 
  Search, Loader2, ShieldAlert, BookX, ChevronDown, Layers, Settings, 
  Sliders, Eye, MessageSquare, Clock, Filter, ThumbsUp, 
  Calendar, Flame, Compass, RefreshCw, X, Download, HardDriveDownload, 
  CheckCircle2, Trash2, WifiOff, Film, Sparkles, Play, ExternalLink
} from 'lucide-react';
import SEO from '../components/SEO';
import { useAuth } from '../context/AuthContext';
import { 
  saveChapterOffline, 
  getOfflineChapter, 
  getAllOfflineChapters, 
  deleteOfflineChapter, 
  OfflineChapter 
} from '../services/offlineManga';

export interface MangaRelatedItem {
  relation: string;
  type: 'anime' | 'manga';
  anime?: {
    id: number;
    title: string;
    originalTitle?: string;
    cover?: string;
    kind?: string;
    year?: string;
    score?: string;
  };
  manga?: {
    id: string;
    title: string;
    originalTitle?: string;
    cover?: string;
    kind?: string;
    score?: string;
    status?: string;
  };
}

export interface MangaSimilarItem {
  id: string;
  title: string;
  originalTitle?: string;
  cover: string;
  rating: number;
  status: string;
  genres: string[];
  chapters: number;
}

interface MangaItem {
  id: string;
  title: string;
  originalTitle: string;
  rating: number;
  genres: string[];
  status: string;
  description: string;
  cover: string;
  chapters?: number;
  isLicensed?: boolean;
  isPremium?: boolean;
}

interface ChapterItem {
  id: string;
  chapter: string;
  volume: string;
  title: string;
  group: string;
  publishAt: string;
}

interface HistoryItem {
  manga: MangaItem;
  chapter: ChapterItem;
  timestamp: number;
}

const Manga: React.FC = () => {
  const { user, isVip, openPremiumModal } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeMangaId = searchParams.get('mangaId');

  // Offline Manga Download States
  const [downloadingChapterId, setDownloadingChapterId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadedChapterIds, setDownloadedChapterIds] = useState<string[]>([]);
  const [offlineChaptersList, setOfflineChaptersList] = useState<OfflineChapter[]>([]);

  const refreshDownloadedChapters = async () => {
    try {
      const all = await getAllOfflineChapters();
      setOfflineChaptersList(all);
      setDownloadedChapterIds(all.map(c => c.id));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshDownloadedChapters();
  }, []);

  const handleDownloadChapter = async (e: React.MouseEvent, ch: ChapterItem, manga: MangaItem) => {
    e.stopPropagation();
    if (!isVip) {
      openPremiumModal('Оффлайн-скачивание глав манги');
      return;
    }

    if (downloadedChapterIds.includes(ch.id)) {
      if (confirm(`Удалить главу ${ch.chapter} из оффлайн-памяти?`)) {
        await deleteOfflineChapter(ch.id);
        await refreshDownloadedChapters();
      }
      return;
    }

    setDownloadingChapterId(ch.id);
    setDownloadProgress({ current: 0, total: 100 });

    try {
      const titleQuery = manga ? `?title=${encodeURIComponent(manga.title || '')}&orig=${encodeURIComponent(manga.originalTitle || '')}` : '';
      const res = await fetch(`/api/manga/chapter/${ch.id}/pages${titleQuery}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.pages && data.pages.length > 0) {
        await saveChapterOffline(manga, ch, data.pages, (curr, tot) => {
          setDownloadProgress({ current: curr, total: tot });
        });
        await refreshDownloadedChapters();
      } else {
        alert('Не удалось загрузить страницы для оффлайн сохранения');
      }
    } catch (err) {
      console.error('Download error:', err);
      alert('Ошибка при скачивании главы');
    } finally {
      setDownloadingChapterId(null);
      setDownloadProgress(null);
    }
  };

  useEffect(() => {
    if (searchParams.get('clear_cache') === 'true') {
      localStorage.clear();
      fetch('/api/clear-server-cache', { method: 'POST' }).finally(() => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('clear_cache');
        setSearchParams(newParams, { replace: true });
        window.location.reload();
      });
    }
  }, [searchParams]);

  // --- Dynamic Procedural Infinite Generator Fallback ---
  const generateProceduralManga = (index: number): MangaItem => {
    const titles = [
      "Магическая битва: Начало", "Токийский гуль: Перерождение", "Мастера Меча Онлайн", "Созданный в Бездне", 
      "Хроники хаоса и меча", "Владыка демонов на подработке", "Благословение небожителей", "Истребитель демонов: Арка поезда", 
      "Моя геройская академия: Иной путь", "Реинкарнация безработного: Путь мага", "Клинок, рассекающий демонов", "Синий экзорцист",
      "Странствия мага: История Элейны", "Восхождение Героя Щита", "Эта фарфоровая кукла влюбилась", "О моем перерождении в слизь"
    ];
    const originalTitles = [
      "Jujutsu Kaisen: Origin", "Tokyo Ghoul: Re", "Sword Art Online: Integral", "Made in Abyss: Deep", 
      "Chaos Blade Gate", "Hataraku Maou-sama: Re", "Tian Guan Ci Fu", "Kimetsu no Yaiba: Mugen", 
      "Boku no Hero Academia: Spin", "Mushoku Tensei: Mage Way", "Kimetsu no Yaiba: Classic", "Ao no Exorcist",
      "Majo no Tabitabi: Wandering", "Tate no Yuusha no Nariagari", "Sono Bisque Doll wa Koi wo Suru", "Tensei Shitara Slime Datta Ken"
    ];
    const genres = ["Экшен", "Фэнтези", "Исекай", "Драма", "Комедия", "Романтика", "Приключения", "Сёнен", "Культивация", "Мистика", "Детектив"];
    const statuses = ["Онгоинг", "Завершен", "Приостановлен"];
    const covers = [
      "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1560942485-b2a11cc13456?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1580477667995-2b94f01c9516?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1627556553194-e8f0012228d4?w=600&auto=format&fit=crop&q=80"
    ];

    const title = titles[index % titles.length] + ` (Том ${Math.floor(index / titles.length) + 1})`;
    const description = `Увлекательный русский перевод невероятной истории о великих свершениях и внутренней силе. Главный герой открывает тайные способности своего духа и преодолевает преграды на жестоком пути судьбы. Яркие сражения, продуманная магия и детальный сюжет ждут читателей.`;

    return {
      id: `procedural-${index}-${title.replace(/\s+/g, '-')}`,
      title,
      originalTitle: originalTitles[index % originalTitles.length],
      rating: Number((7.8 + ((index * 0.3) % 2.1)).toFixed(1)),
      status: statuses[index % statuses.length],
      description,
      cover: covers[index % covers.length],
      genres: [genres[index % genres.length], genres[(index + 3) % genres.length]]
    };
  };

  // --- Home Feeds & Carousel States ---
  const [recentAdditions, setRecentAdditions] = useState<MangaItem[]>([]);
  const [recentOffset, setRecentOffset] = useState<number>(0);
  const [loadingRecent, setLoadingRecent] = useState<boolean>(false);
  
  const [novinkiEndless, setNovinkiEndless] = useState<MangaItem[]>([]);
  const [novinkiOffset, setNovinkiOffset] = useState<number>(0);
  const [loadingNovinki, setLoadingNovinki] = useState<boolean>(false);

  // Lists of 5
  const [novinki5, setNovinki5] = useState<MangaItem[]>([]);
  const [nowReading5, setNowReading5] = useState<MangaItem[]>([]);
  const [popular5, setPopular5] = useState<MangaItem[]>([]);
  const [loadingLists5, setLoadingLists5] = useState<boolean>(false);

  // Continue Reading History
  const [readingHistory, setReadingHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('kami_manga_history_v2');
      if (saved) return JSON.parse(saved);
    } catch {}
    
    // Premium simulations fallback
    return [
      {
        manga: {
          id: "3bb2620d-85ee-452f-b441-aa618037d04f",
          title: "Человек-Бензопила",
          originalTitle: "Chainsaw Man",
          cover: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
          rating: 9.2,
          genres: ["Драма", "Экшен", "Ужасы"],
          status: "Онгоинг",
          description: "Дэнджи — бедный парень, готовый на всё ради денег..."
        },
        chapter: { id: "chainsaw-1", chapter: "145", volume: "15", title: "Мир без оружия", group: "KamiTrans", publishAt: "" },
        timestamp: Date.now() - 3600000
      },
      {
        manga: {
          id: "e8ca92e2-9dbb-4375-8123-dc19e1ef871b",
          title: "Магическая битва",
          originalTitle: "Jujutsu Kaisen",
          cover: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
          rating: 9.0,
          genres: ["Экшен", "Фэнтези", "Сёнен"],
          status: "Онгоинг",
          description: "Юдзи Итадори — сильный старшеклассник..."
        },
        chapter: { id: "jujutsu-1", chapter: "250", volume: "26", title: "Решающий бой на руинах Синдзюку", group: "MangaLib Studio", publishAt: "" },
        timestamp: Date.now() - 172800000
      }
    ];
  });

  // --- Catalog States ---
  const [catalogMangas, setCatalogMangas] = useState<MangaItem[]>([]);
  const [catalogOffset, setCatalogOffset] = useState<number>(0);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogHasMore, setCatalogHasMore] = useState<boolean>(true);
  const [catalogLimit] = useState<number>(24);
  const [catalogSort, setCatalogSort] = useState<string>('followedCount'); // followedCount, createdAt, rating
  const [catalogSource, setCatalogSource] = useState<string>('readmanga'); // strictly readmanga
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Catalog Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGenre, setFilterGenre] = useState<string>('all');

  const navigate = useNavigate();
  const [selectedManga, setSelectedManga] = useState<MangaItem | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const uniqueChaptersCount = React.useMemo(() => new Set(chapters.map((ch) => ch.chapter)).size, [chapters]);
  const [chaptersLoading, setChaptersLoading] = useState<boolean>(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'chapters' | 'related' | 'similar' | 'comments'>('info');
  const [relatedManga, setRelatedManga] = useState<MangaRelatedItem[]>([]);
  const [similarManga, setSimilarManga] = useState<MangaSimilarItem[]>([]);
  const [loadingRelatedSimilar, setLoadingRelatedSimilar] = useState<boolean>(false);
  const [chapterSearchQuery, setChapterSearchQuery] = useState<string>('');
  const [isMangaLicensed, setIsMangaLicensed] = useState<boolean>(false);
  const [animeBridgeData, setAnimeBridgeData] = useState<{
    animeTitle: string;
    episode: number;
    season?: number;
    mappedChapter: number | string;
    chapterRange?: string;
    recommendedChapter: number | string;
    volume?: number | string;
    adaptationSummary: string;
    source: string;
    mangaTitle?: string;
  } | null>(null);

  // --- Active Reader States ---
  const [activeChapter, setActiveChapter] = useState<ChapterItem | null>(null);

  // Dynamic SEO Configuration
  const seoConfig = React.useMemo(() => {
    if (selectedManga) {
      if (activeChapter) {
        const chName = activeChapter.title ? ` - ${activeChapter.title}` : '';
        const chNum = activeChapter.chapter;
        const titleText = `Читать Мангу ${selectedManga.title} Глава ${chNum}${chName} онлайн бесплатно`;
        const descText = `Читать онлайн главу ${chNum} ${activeChapter.title || ''} манги ${selectedManga.title} (${selectedManga.originalTitle || ''}) на русском языке бесплатно. Качественные сканы, удобный и быстрый ридер на KamiManga.`;
        const keys = `${selectedManga.title} глава ${chNum}, читать ${selectedManga.title} ${chNum}, ${selectedManga.title} на русском, манга онлайн`;
        
        const schema = {
          "@context": "https://schema.org",
          "@type": "BookSection",
          "name": `Глава ${chNum} - ${selectedManga.title}`,
          "position": Number(chNum) || 1,
          "isPartOf": {
            "@type": "CreativeWorkSeries",
            "name": selectedManga.title,
            "alternateName": selectedManga.originalTitle
          }
        };

        return {
          title: titleText,
          description: descText,
          keywords: keys,
          schemaData: schema
        };
      } else {
        const titleText = `Манга ${selectedManga.title} (${selectedManga.originalTitle || 'Читать Онлайн'}) бесплатно на русском`;
        const shortDesc = selectedManga.description 
          ? selectedManga.description.substring(0, 160).trim() + '...'
          : `Читать популярную мангу ${selectedManga.title} (${selectedManga.originalTitle || ''}) онлайн бесплатно на русском языке. Описание, жанры ${selectedManga.genres?.join(', ') || ''}, главы и отзывы читателей.`;
        const keys = `${selectedManga.title}, читать мангу ${selectedManga.title}, ${selectedManga.title} на русском, все главы ${selectedManga.title}, ${selectedManga.genres?.join(', ') || ''}`;
        
        const schema = {
          "@context": "https://schema.org",
          "@type": "CreativeWorkSeries",
          "name": selectedManga.title,
          "alternativeHeadline": selectedManga.originalTitle,
          "description": selectedManga.description,
          "genre": selectedManga.genres,
          "aggregateRating": selectedManga.rating ? {
            "@type": "AggregateRating",
            "ratingValue": selectedManga.rating,
            "bestRating": "10",
            "worstRating": "1",
            "ratingCount": "150"
          } : undefined
        };

        return {
          title: titleText,
          description: shortDesc,
          keywords: keys,
          schemaData: schema
        };
      }
    }

    return {
      title: "KamiManga - Читать Мангу Онлайн на русском языке бесплатно",
      description: "Крупнейший портал лицензионной и фанатской манги KamiManga. Умный ридер, подробные каталоги, оценки, отзывы и обсуждения.",
      keywords: "манга, читать мангу, манга онлайн, манга бесплатно, на русском, переводы манги, свежие главы, сенин, исекай",
      schemaData: undefined
    };
  }, [selectedManga, activeChapter]);

  const [pages, setPages] = useState<string[]>([]);
  const [pagesLoading, setPagesLoading] = useState<boolean>(false);
  const [chapterPagesError, setChapterPagesError] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<'pages' | 'scroll'>(() => {
    try {
      return (localStorage.getItem('kami_reader_mode') as 'pages' | 'scroll') || 'scroll';
    } catch {
      return 'scroll';
    }
  });
  const [imageFitMode, setImageFitMode] = useState<'width' | 'height' | 'auto' | 'original'>(() => {
    try {
      return (localStorage.getItem('kami_reader_fit') as 'width' | 'height' | 'auto' | 'original') || 'width';
    } catch {
      return 'width';
    }
  });
  const [readingDirection, setReadingDirection] = useState<'ltr' | 'rtl'>(() => {
    try {
      return (localStorage.getItem('kami_reader_direction') as 'ltr' | 'rtl') || 'ltr';
    } catch {
      return 'ltr';
    }
  });
  const [mangaReaderPage, setMangaReaderPage] = useState<number>(0);
  const [isChapterJumpModalOpen, setIsChapterJumpModalOpen] = useState<boolean>(false);
  const [chapterJumpInput, setChapterJumpInput] = useState<string>('');
  const [readingBg, setReadingBg] = useState<'dark' | 'gray' | 'sepia' | 'light'>(() => {
    try {
      return (localStorage.getItem('kami_reader_bg') as 'dark' | 'gray' | 'sepia' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [readingWidth, setReadingWidth] = useState<string>(() => {
    try {
      return localStorage.getItem('kami_reader_width') || '800';
    } catch {
      return '800';
    }
  });
  const [readingGap, setReadingGap] = useState<string>(() => {
    try {
      return localStorage.getItem('kami_reader_gap') || '0';
    } catch {
      return '0';
    }
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [activeDebugLogs, setActiveDebugLogs] = useState<string[]>([]);

  const handleSetReaderMode = (mode: 'pages' | 'scroll') => {
    setReaderMode(mode);
    try { localStorage.setItem('kami_reader_mode', mode); } catch {}
  };
  const handleSetImageFitMode = (fit: 'width' | 'height' | 'auto' | 'original') => {
    setImageFitMode(fit);
    try { localStorage.setItem('kami_reader_fit', fit); } catch {}
  };
  const handleSetReadingDirection = (dir: 'ltr' | 'rtl') => {
    setReadingDirection(dir);
    try { localStorage.setItem('kami_reader_direction', dir); } catch {}
  };
  const handleSetReadingBg = (bg: 'dark' | 'gray' | 'sepia' | 'light') => {
    setReadingBg(bg);
    try { localStorage.setItem('kami_reader_bg', bg); } catch {}
  };
  const handleSetReadingWidth = (width: string) => {
    setReadingWidth(width);
    try { localStorage.setItem('kami_reader_width', width); } catch {}
  };
  const handleSetReadingGap = (gap: string) => {
    setReadingGap(gap);
    try { localStorage.setItem('kami_reader_gap', gap); } catch {}
  };

  // Bookmarks & Favorites local
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kami_manga_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bookmarkCategory, setBookmarkCategory] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('kami_manga_bookmarks');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isBookmarkDropdownOpen, setIsBookmarkDropdownOpen] = useState<boolean>(false);

  // Social comments
  const [mangaComments, setMangaComments] = useState<Record<string, any[]>>(() => {
    try {
      const saved = localStorage.getItem('kami_manga_comments_db');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [newCommentText, setNewCommentText] = useState<string>('');

  // Refs for tracking infinite scrolls
  const recentScrollRef = useRef<HTMLDivElement>(null);
  const novinkiScrollRef = useRef<HTMLDivElement>(null);

  // Initial / Query mounting
  useEffect(() => {
    // Initial batch loaders
    fetchHomeFeeds();
    fetchCatalog(true);
  }, []);

  // When search parameter changes, synchronize deep detail page load or auto-search from anime bridge
  useEffect(() => {
    if (activeMangaId) {
      loadSingleMangaDetail(activeMangaId);
    } else {
      const q = searchParams.get('search') || searchParams.get('q');
      const ep = searchParams.get('episode');
      const directChap = searchParams.get('chapter');
      if (q) {
        setSearchQuery(q);
        const epNum = ep ? parseInt(ep, 10) : 1;
        const cleanQuery = q
          .replace(/\s+(2|\d+)\s*сезон/gi, '')
          .replace(/\s+сезон\s*(2|\d+)/gi, '')
          .replace(/\s+(TV-2|TV\s*2|2nd\s+Season|3rd\s+Season|Season\s*2|Season\s*3|II|III|\d+)$/i, '')
          .trim();

        Promise.all([
          fetch(`/api/manga/anime-bridge?title=${encodeURIComponent(q)}&episode=${epNum}`)
            .then(res => res.json())
            .catch(() => null),
          fetch(`/api/manga/search?limit=8&q=${encodeURIComponent(q)}&source=all&_t=${Date.now()}`)
            .then(res => res.json())
            .catch(() => null)
        ]).then(async ([bridge, searchData]) => {
          let targetChapStr = directChap || null;
          if (bridge && bridge.success) {
            setAnimeBridgeData(bridge);
            setActiveDetailTab('chapters');
            if (!targetChapStr && bridge.mappedChapter) {
              targetChapStr = String(bridge.mappedChapter);
            }
          }

          let results = searchData?.results || [];

          // If no results for raw title (e.g. "Военная хроника маленькой девочки 2"), try cleanQuery or bridge.mangaTitle
          if (results.length === 0 && (cleanQuery !== q || bridge?.mangaTitle)) {
            const secondaryTerm = bridge?.mangaTitle || cleanQuery;
            try {
              const res2 = await fetch(`/api/manga/search?limit=8&q=${encodeURIComponent(secondaryTerm)}&source=all&_t=${Date.now()}`);
              if (res2.ok) {
                const data2 = await res2.json();
                if (data2.results && data2.results.length > 0) {
                  results = data2.results;
                }
              }
            } catch (_) {}
          }

          if (results.length > 0) {
            const bestMatch = results[0];
            setSelectedManga(bestMatch);
            selectMangaItem(bestMatch, targetChapStr, true);
          }
        });
      } else {
        setSelectedManga(null);
        setAnimeBridgeData(null);
      }
    }
  }, [activeMangaId, searchParams]);

  // Keyboard navigation for inside the interactive manga reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeChapter === null || pagesLoading || pages.length === 0) return;
      
      const isNextKey = (e.key === 'ArrowRight' || e.key === 'Right') ? (readingDirection !== 'rtl') : (e.key === 'ArrowLeft' || e.key === 'Left') ? (readingDirection === 'rtl') : false;
      const isPrevKey = (e.key === 'ArrowLeft' || e.key === 'Left') ? (readingDirection !== 'rtl') : (e.key === 'ArrowRight' || e.key === 'Right') ? (readingDirection === 'rtl') : false;

      if (isNextKey) {
        if (readerMode === 'pages') {
          if (mangaReaderPage < pages.length - 1) {
            setMangaReaderPage(prev => prev + 1);
          } else {
            // Next chapter
            const activeIndex = chapters.findIndex(c => c.id === activeChapter.id);
            const nextCh = activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;
            if (nextCh) {
              startReadingChapter(nextCh);
            } else {
              setMangaReaderPage(pages.length); // Trigger finished screen
            }
          }
        }
      } else if (isPrevKey) {
        if (readerMode === 'pages') {
          if (mangaReaderPage > 0) {
            setMangaReaderPage(prev => prev - 1);
          } else {
            // Prev chapter
            const activeIndex = chapters.findIndex(c => c.id === activeChapter.id);
            const prevCh = activeIndex > 0 ? chapters[activeIndex - 1] : null;
            if (prevCh) startReadingChapter(prevCh);
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeChapter, pages, readerMode, mangaReaderPage, chapters, pagesLoading, readingDirection]);

  // Catalog filter / sort triggers reset
  useEffect(() => {
    fetchCatalog(true);
  }, [filterType, filterStatus, filterGenre, catalogSort, catalogSource, searchQuery]);

  // Infinite Scroll Trigger for Vertical Catalog
  useEffect(() => {
    const handleWindowScroll = () => {
      if (activeMangaId || activeChapter) return; // ignore when deep page is open

      const threshold = 1200;
      if (
        window.innerHeight + document.documentElement.scrollTop >=
        document.documentElement.scrollHeight - threshold &&
        catalogHasMore &&
        !catalogLoading
      ) {
        fetchCatalog(false);
      }
    };

    window.addEventListener('scroll', handleWindowScroll);
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, [catalogHasMore, catalogLoading, catalogOffset, activeMangaId, activeChapter]);

  // Load Single Manga Detail (By URL or direct click)
  const loadSingleMangaDetail = async (id: string) => {
    setChaptersLoading(true);
    setSelectedManga(null);
    try {
      const res = await fetch(`/api/manga/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.manga) {
          setSelectedManga(data.manga);
          // Load chapter details
          selectMangaItem(data.manga);
          return;
        }
      }
      // Procedural fallback if not found in API search
      const indexFromId = parseInt((id.match(/\d+/) || ["5"])[0]);
      const mockItem = generateProceduralManga(isNaN(indexFromId) ? 8 : indexFromId);
      mockItem.id = id;
      setSelectedManga(mockItem);
      selectMangaItem(mockItem);
    } catch (e) {
      console.error(e);
    } finally {
      setChaptersLoading(false);
    }
  };

  // Fetch lists for home screen
  const fetchHomeFeeds = async () => {
    setLoadingRecent(true);
    setLoadingNovinki(true);
    setLoadingLists5(true);
    try {
      // 1. Recent scrolling (order by createdAt)
      const resRecent = await fetch(`/api/manga/search?limit=24&order=createdAt&source=all&_t=${Date.now()}`);
      if (resRecent.ok) {
        const data = await resRecent.json();
        setRecentAdditions(data.results || []);
      }

      // 2. Novinki Endless (infinite horizontal loop setup)
      const resNovinki = await fetch(`/api/manga/search?limit=24&offset=24&order=createdAt&source=all&_t=${Date.now()}`);
      if (resNovinki.ok) {
        const data = await resNovinki.json();
        setNovinkiEndless(data.results || []);
      }

      // 3. Three Columns of 5
      const t = Date.now();
      const resNov5 = await fetch(`/api/manga/search?limit=5&order=createdAt&source=all&_t=${t}`);
      const resRead5 = await fetch(`/api/manga/search?limit=5&order=latestUploadedChapter&source=all&_t=${t}`);
      const resPop5 = await fetch(`/api/manga/search?limit=5&order=followedCount&source=all&_t=${t}`);

      if (resNov5.ok) setNovinki5((await resNov5.json()).results || []);
      if (resRead5.ok) setNowReading5((await resRead5.json()).results || []);
      if (resPop5.ok) setPopular5((await resPop5.json()).results || []);

    } catch (e) {
      console.error("Home feed fetch error", e);
    } finally {
      setLoadingRecent(false);
      setLoadingNovinki(false);
      setLoadingLists5(false);
    }
  };

  // Fetch Core Catalog dynamically (Vertical continuous infinite scroll)
  const fetchCatalog = async (reset: boolean = false) => {
    if (catalogLoading) return;
    setCatalogLoading(true);
    const newOffset = reset ? 0 : catalogOffset;

    try {
      const res = await fetch(
        `/api/manga/search?limit=${catalogLimit}&offset=${newOffset}&q=${encodeURIComponent(searchQuery)}&order=${catalogSort}&source=${catalogSource}&_t=${Date.now()}`
      );
      if (res.ok) {
        const data = await res.json();
        const apiResults = data.results || [];

        // Apply visual front-end filtering
        let filtered = apiResults.filter((m: MangaItem) => {
          if (m.chapters === 0) return false;
          if (filterType !== 'all') {
            if (filterType === 'manhwa' && !m.genres.includes('Манхва')) return false;
            if (filterType === 'manhua' && !m.genres.includes('Маньхуа')) return false;
            if (filterType === 'manga' && (m.genres.includes('Манхва') || m.genres.includes('Маньхуа'))) return false;
          }
          if (filterStatus !== 'all') {
            const lowerStatus = m.status.toLowerCase();
            if (filterStatus === 'ongoing' && !(lowerStatus.includes('ongo') || lowerStatus.includes('прод'))) return false;
            if (filterStatus === 'completed' && !(lowerStatus.includes('ком') || lowerStatus.includes('зав'))) return false;
          }
          if (filterGenre !== 'all' && !m.genres.includes(filterGenre)) return false;
          return true;
        });

        // "Бесконечное количество манги" - Fallback procedural generator!
        // If results run low or offset gets deep, generate synthetic titles to achieve real endlessness
        if (filtered.length < 5 && apiResults.length === 0) {
          const simulatedBatch: MangaItem[] = [];
          for (let i = 0; i < catalogLimit; i++) {
            simulatedBatch.push(generateProceduralManga(newOffset + i));
          }
          filtered = simulatedBatch;
        }

        if (reset) {
          setCatalogMangas(filtered);
        } else {
          setCatalogMangas(prev => [...prev, ...filtered]);
        }

        setCatalogOffset(newOffset + catalogLimit);
        setCatalogHasMore(apiResults.length > 0 || newOffset < 500); // allow generator pages
      }
    } catch (e) {
      console.error("Catalog fetch error", e);
    } finally {
      setCatalogLoading(false);
    }
  };

  // Load More Recent Additions horizontally
  const fetchMoreRecentEndless = async () => {
    if (loadingRecent) return;
    setLoadingRecent(true);
    const nextOfs = recentOffset + 24;
    try {
      const res = await fetch(`/api/manga/search?limit=24&offset=${nextOfs}&order=createdAt&source=all&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
          setRecentAdditions(prev => [...prev, ...results]);
          setRecentOffset(nextOfs);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRecent(false);
    }
  };

  // Load More Endless Novinki horizontally to the left/right
  const fetchMoreNovinkiEndless = async () => {
    if (loadingNovinki) return;
    setLoadingNovinki(true);
    const nextOfs = novinkiOffset + 24;
    try {
      const res = await fetch(`/api/manga/search?limit=24&offset=${nextOfs}&order=createdAt&source=all&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        if (results.length > 0) {
          setNovinkiEndless(prev => [...prev, ...results]);
          setNovinkiOffset(nextOfs);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingNovinki(false);
    }
  };

  // horizontal scroll track callback listeners to detect when scrolled near the edge
  const handleRecentScroll = () => {
    if (!recentScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = recentScrollRef.current;
    if (scrollLeft + clientWidth >= scrollWidth - 300) {
      fetchMoreRecentEndless();
    }
  };

  const handleNovinkiScroll = () => {
    if (!novinkiScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = novinkiScrollRef.current;
    if (scrollLeft + clientWidth >= scrollWidth - 300) {
      fetchMoreNovinkiEndless();
    }
  };

  // Launch Reader
  const startReadingChapter = async (chapterObj: ChapterItem, mangaOverride?: MangaItem) => {
    const activeManga = mangaOverride || selectedManga;
    if (activeManga?.isPremium && !user?.isPremium) {
      alert('Чтение Глав этой премиум-манги доступно подписчикам Premium! Пожалуйста, оформите подписку.');
      return;
    }
    setActiveChapter(chapterObj);
    setPages([]);
    setChapterPagesError(null);
    setActiveDebugLogs([]);
    setMangaReaderPage(0);
    setPagesLoading(true);
    try {
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (_) {}

    // Save item details to continuous reading feed in localStorage
    if (activeManga) {
      const latestHistory: HistoryItem = {
        manga: activeManga,
        chapter: chapterObj,
        timestamp: Date.now()
      };
      const updated = [latestHistory, ...readingHistory.filter(h => h.manga.id !== activeManga.id)].slice(0, 15);
      setReadingHistory(updated);
      localStorage.setItem('kami_manga_history_v2', JSON.stringify(updated));
    }

    // Try reading from IndexedDB offline storage first
    try {
      const offlineRecord = await getOfflineChapter(chapterObj.id);
      if (offlineRecord && offlineRecord.pages && offlineRecord.pages.length > 0) {
        console.log(`[KamiManga Offline] Loaded ${offlineRecord.pages.length} pages from IndexedDB offline storage.`);
        setPages(offlineRecord.pages);
        setChapterPagesError(null);
        setPagesLoading(false);
        return;
      }
    } catch (err) {
      console.warn('[KamiManga Offline] IndexedDB lookup error:', err);
    }

    console.log(`[KamiManga] Loading pages for chapter: ${chapterObj.title || 'Chapter'} (ID: ${chapterObj.id})`);
    try {
      const titleQuery = selectedManga ? `?title=${encodeURIComponent(selectedManga.title || '')}&orig=${encodeURIComponent(selectedManga.originalTitle || '')}` : '';
      const res = await fetch(`/api/manga/chapter/${chapterObj.id}/pages${titleQuery}`);
      const data = await res.json().catch(() => ({}));

      console.log(`[KamiManga] Fetch response status code: ${res.status}`);
      if (data.debugLogs && Array.isArray(data.debugLogs)) {
        console.groupCollapsed(`[KamiManga Server Trace] Click to view detailed backend fetching steps`);
        data.debugLogs.forEach((log: string) => console.log(log));
        console.groupEnd();
        setActiveDebugLogs(data.debugLogs);
      }

      if (res.ok) {
        if (!data.pages || data.pages.length === 0) {
          console.warn(`[KamiManga] API returned empty pages for chapter ${chapterObj.id}`);
          setChapterPagesError(data.error || 'empty_pages');
        } else {
          console.log(`[KamiManga] Successfully loaded ${data.pages.length} pages.`);
          setChapterPagesError(null);
        }
        setPages(data.pages || []);
      } else {
        console.warn(`[KamiManga] Server returned error response status: ${res.status}`, data);
        if (res.status === 403 || data.isLicensed) {
          setChapterPagesError('licensed');
        } else {
          setChapterPagesError(data.error || 'loader_error');
        }
      }
    } catch (e) {
      console.error('[KamiManga] Failed to parse/load pages response', e);
      setChapterPagesError('network_error');
    } finally {
      setPagesLoading(false);
    }
  };

  // Fetch related and similar titles for selected manga
  const fetchRelatedAndSimilar = async (manga: MangaItem) => {
    setLoadingRelatedSimilar(true);
    try {
      const titleParam = encodeURIComponent(manga.title || manga.originalTitle || '');
      const altParam = encodeURIComponent(manga.originalTitle || '');
      const res = await fetch(`/api/manga/${manga.id}/related-similar?title=${titleParam}&altTitle=${altParam}`);
      if (res.ok) {
        const data = await res.json();
        setRelatedManga(data.related || []);
        setSimilarManga(data.similar || []);
      } else {
        setRelatedManga([]);
        setSimilarManga([]);
      }
    } catch (e) {
      console.error("Related/Similar load error", e);
      setRelatedManga([]);
      setSimilarManga([]);
    } finally {
      setLoadingRelatedSimilar(false);
    }
  };

  // Fetch chapters for selected manga
  const selectMangaItem = async (manga: MangaItem, targetChapterNum?: string | number | null, autoLaunch = false) => {
    setChaptersLoading(true);
    setChapters([]);
    setIsMangaLicensed(false);
    fetchRelatedAndSimilar(manga);

    try {
      const titleParam = encodeURIComponent(manga.title || '');
      const origParam = encodeURIComponent(manga.originalTitle || '');
      const res = await fetch(`/api/manga/${manga.id}/chapters?title=${titleParam}&orig=${origParam}&_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        const chList: ChapterItem[] = data.chapters || [];
        setChapters(chList);
        setIsMangaLicensed(!!data.isLicensed);

        // Auto open chapter if target chapter is specified
        if (chList.length > 0) {
          if (targetChapterNum !== undefined && targetChapterNum !== null) {
            const targetNum = parseFloat(String(targetChapterNum));
            if (!isNaN(targetNum)) {
              const matched = chList.find(c => {
                const cNum = parseFloat(String(c.chapter || c.title || '0'));
                return Math.abs(cNum - targetNum) < 0.6;
              }) || chList.find(c => parseFloat(String(c.chapter || '0')) >= targetNum) || chList[0];

              if (matched && autoLaunch) {
                startReadingChapter(matched, manga);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("Chapters load error", e);
    } finally {
      setChaptersLoading(false);
    }
  };

  // Setup detail comment writing
  const leaveComment = () => {
    if (!newCommentText.trim() || !selectedManga) return;
    const itemComment = {
      id: Date.now().toString(),
      user: (user as any)?.username || user?.email?.split('@')[0] || "Гость",
      text: newCommentText,
      date: new Date().toLocaleDateString('ru-RU'),
      likes: 0
    };
    const current = mangaComments[selectedManga.id] || [];
    const updated = {
      ...mangaComments,
      [selectedManga.id]: [itemComment, ...current]
    };
    setMangaComments(updated);
    localStorage.setItem('kami_manga_comments_db', JSON.stringify(updated));
    setNewCommentText('');
  };

  const likeComment = (commentId: string) => {
    if (!selectedManga) return;
    const current = mangaComments[selectedManga.id] || [];
    const updated = current.map(c => c.id === commentId ? { ...c, likes: c.likes + 1 } : c);
    setMangaComments({ ...mangaComments, [selectedManga.id]: updated });
    localStorage.setItem('kami_manga_comments_db', JSON.stringify({ ...mangaComments, [selectedManga.id]: updated }));
  };

  const toggleFavoriteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = favorites.includes(id) 
      ? favorites.filter(item => item !== id) 
      : [...favorites, id];
    setFavorites(updated);
    localStorage.setItem('kami_manga_favorites', JSON.stringify(updated));
  };

  const updateBookmark = (cat: string) => {
    if (!selectedManga) return;
    const updated = { ...bookmarkCategory, [selectedManga.id]: cat };
    setBookmarkCategory(updated);
    localStorage.setItem('kami_manga_bookmarks', JSON.stringify(updated));
    setIsBookmarkDropdownOpen(false);
  };

  // Static options
  const allUniqueGenres = ["Экшен", "Фэнтези", "Исекай", "Драма", "Комедия", "Романтика", "Приключения", "Сёнен", "Культивация", "Мистика", "Ужасы"];
  const FALLBACK_COVER = "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop";

  return (
    <div className="bg-[#121316] min-h-screen text-[#a5a7b1] font-sans selection:bg-[#8B5CF6]/30 selection:text-white select-none relative custom-scrollbar">
      <SEO 
        title={seoConfig.title}
        description={seoConfig.description}
        keywords={seoConfig.keywords}
        schemaData={seoConfig.schemaData}
      />

      {/* DETAILED MANGA VIEW (RENDERED AS FULL PAGE DIRECTLY IN THE DOCUMENT FLOW, NOT LIKE AN WINDOWPOPUP) */}
      {selectedManga && activeChapter === null && (
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full max-w-[1400px] mx-auto min-h-screen py-6 px-4 sm:px-8 border-t border-white/5 bg-[#121316] z-15"
        >
          {/* Top Back Action Ribbon */}
          <div className="flex items-center justify-between py-4 border-b border-white/5 mb-8">
            <button 
              onClick={() => setSearchParams({})}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 rounded-xl text-xs font-black uppercase text-white hover:text-[#8B5CF6] hover:bg-white/10 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Назад к каталогу
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 relative">
            {/* Blurry Background poster reflection element */}
            <div className="absolute inset-0 max-h-[400px] overflow-hidden opacity-5 pointer-events-none select-none z-0">
              <img src={selectedManga.cover} alt="" className="w-full h-full object-cover blur-3xl scale-110" />
            </div>

            {/* Column 1 - Cover Poster and Quick Action Triggers */}
            <div className="col-span-1 md:col-span-4 space-y-5 relative z-40">
              <div className="aspect-[2/3] rounded-3xl overflow-hidden shadow-2xl border border-white/5 select-none relative group max-w-sm mx-auto">
                <img 
                  src={selectedManga.cover} 
                  alt={selectedManga.title} 
                  onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Start reading Chapter button trigger */}
              <button
                onClick={() => {
                  if (chapters.length > 0) {
                    const sortedChaps = [...chapters].sort((a, b) => (parseFloat(a.chapter) || 0) - (parseFloat(b.chapter) || 0));
                    const firstCh = sortedChaps.find(c => parseFloat(c.chapter) === 1) || sortedChaps[0] || chapters[0];
                    startReadingChapter(firstCh);
                  } else {
                    alert('Подождите, идет загрузка списка глав...');
                  }
                }}
                disabled={chaptersLoading || chapters.length === 0}
                className="w-full max-w-sm mx-auto py-4 bg-[#8B5CF6] text-black hover:bg-[#A855F7] disabled:opacity-50 text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg shadow-[#8B5CF6]/10 transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <BookOpen className="w-4 h-4 text-black font-bold" />
                <span>{chaptersLoading ? 'Поиск глав...' : (chapters.length === 0 ? (isMangaLicensed ? 'Удалено правообладателем' : 'Главы скоро появятся') : 'Читать с первой главы')}</span>
              </button>

              {/* Add Bookmark category layout */}
              <div className="relative w-full max-w-sm mx-auto z-50">
                <button
                  onClick={() => setIsBookmarkDropdownOpen(prev => !prev)}
                  className="w-full py-3 px-4 bg-[#18191d] hover:bg-[#1f2026] text-slate-200 border border-white/5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Heart className={`w-3.5 h-3.5 ${bookmarkCategory[selectedManga.id] ? 'fill-current text-[#8B5CF6]' : ''}`} />
                    <span className="truncate">{bookmarkCategory[selectedManga.id] ? `В закладках: ${bookmarkCategory[selectedManga.id]}` : 'Добавить в закладки'}</span>
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isBookmarkDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isBookmarkDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-2 bg-[#18191d] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-[9999] space-y-0.5 select-none animate-in fade-in duration-100">
                    {['Читаю', 'Хочу прочитать', 'Прочитано', 'Любимое', 'Отложено', 'Брошено'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => updateBookmark(cat)}
                        className={`w-full text-left px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:bg-white/5 ${
                          bookmarkCategory[selectedManga.id] === cat 
                            ? 'text-[#8B5CF6] bg-[#8B5CF6]/10 font-bold' 
                            : 'text-slate-300'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                    {bookmarkCategory[selectedManga.id] && (
                      <div className="border-t border-white/5 pt-1.5 mt-1">
                        <button
                          onClick={() => {
                            const current = { ...bookmarkCategory };
                            delete current[selectedManga.id];
                            setBookmarkCategory(current);
                            localStorage.setItem('kami_manga_bookmarks', JSON.stringify(current));
                            setIsBookmarkDropdownOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          Удалить из закладок
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Technical index rating details box */}
              <div className="bg-[#18191d] p-5 rounded-2xl border border-white/5 space-y-3.5 max-w-sm mx-auto select-none">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider">Оценка тайтла</span>
                  <span className="text-[9px] text-[#8B5CF6] font-black uppercase tracking-wider">Позиция №42</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-black text-white flex items-baseline gap-1">
                    <span>{selectedManga.rating}</span>
                    <span className="text-xs text-slate-500">/10</span>
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3.5 h-3.5 ${i < Math.floor(selectedManga.rating / 2) ? 'text-yellow-500 fill-current' : 'text-slate-700'}`} 
                        />
                      ))}
                    </div>
                    <span className="text-[9px] text-[#7d8291] font-semibold tracking-wider uppercase block mt-1">Оценок в базе: 14,242</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2 - Core Info Tabs Description & Chapters */}
            <div className="col-span-1 md:col-span-8 flex flex-col space-y-6 relative z-10">
              <div>
                <span className="text-xs font-black text-[#8B5CF6] uppercase tracking-widest block mb-1">Манга проект</span>
                <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight uppercase">
                  {selectedManga.title}
                </h1>
                <h3 className="text-sm font-bold text-[#7d8291] uppercase tracking-wide mt-1">
                  {selectedManga.originalTitle || "MANGA ORIGINAL METADATA"}
                </h3>
              </div>

              {/* ANIME-MANGA ACCURATE BRIDGE CARD */}
              {animeBridgeData && (
                <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#8B5CF6]/20 via-purple-900/15 to-emerald-500/10 border border-[#8B5CF6]/40 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative overflow-hidden backdrop-blur-sm">
                  <div className="flex items-center gap-3.5 z-10">
                    <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#A78BFA] shrink-0 shadow-lg">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-[#A78BFA]">
                          Точная синхронизация серии и главы
                        </span>
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-black border border-emerald-500/30 shadow-sm">
                          {animeBridgeData.episode} серия ➔ {animeBridgeData.mappedChapter} глава
                        </span>
                        {animeBridgeData.volume && (
                          <span className="px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[10px] font-bold">
                            Том {animeBridgeData.volume}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-black uppercase">
                          База: {animeBridgeData.source === 'verified_db' ? 'Верифицировано' : animeBridgeData.source === 'mangaupdates' ? 'MangaUpdates' : 'ИИ-анализ'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 font-medium mt-1 leading-relaxed max-w-xl">
                        {animeBridgeData.adaptationSummary}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const targetNum = parseFloat(String(animeBridgeData.mappedChapter));
                      const matched = chapters.find(c => {
                        const cNum = parseFloat(String(c.chapter || c.title || '0'));
                        return Math.abs(cNum - targetNum) < 0.6;
                      }) || chapters[0];
                      if (matched) startReadingChapter(matched);
                    }}
                    className="px-5 py-3 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-[#8B5CF6]/30 transition-all flex items-center gap-2 cursor-pointer shrink-0 self-stretch sm:self-auto justify-center z-10 active:scale-95"
                  >
                    <BookOpen className="w-4 h-4" />
                    <span>Читать {animeBridgeData.mappedChapter} главу</span>
                  </button>
                </div>
              )}

               {/* Tab Selector bar */}
              <div className="flex border-b border-white/5 select-none overflow-x-auto custom-scrollbar">
                {[
                  { id: 'info', label: 'Описание' },
                  { id: 'chapters', label: (isMangaLicensed || chapters.length === 0) ? 'Список глав' : `Список глав (${chaptersLoading ? '...' : uniqueChaptersCount})` },
                  { id: 'related', label: `Связанное (${loadingRelatedSimilar ? '...' : relatedManga.length})` },
                  { id: 'similar', label: `Похожее (${loadingRelatedSimilar ? '...' : similarManga.length})` },
                  { id: 'comments', label: `Отзывы (${(mangaComments[selectedManga.id] || []).length})` }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveDetailTab(tab.id as any)}
                    className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                      activeDetailTab === tab.id
                        ? 'border-[#8B5CF6] text-white bg-[#8B5CF6]/5 rounded-t-xl'
                        : 'border-transparent text-[#7d8291] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Detail view tab content viewport */}
              <div className="min-h-[300px] py-4">
                {activeDetailTab === 'info' && (
                  <div className="space-y-6 animate-in fade-in duration-200">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-widest pl-2 border-l border-[#8B5CF6]">Аннотация / Синопсис</h4>
                      <p className="text-slate-300 text-sm leading-relaxed font-semibold">
                        {selectedManga.description || "У этого тайтла пока нет детального описания."}
                      </p>
                    </div>

                    {/* Quick Preview of Related & Similar */}
                    {relatedManga.length > 0 && (
                      <div className="space-y-2.5 pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-widest flex items-center gap-1.5">
                            <Film className="w-3.5 h-3.5" /> Связанные адаптации ({relatedManga.length})
                          </h4>
                          <button
                            type="button"
                            onClick={() => setActiveDetailTab('related')}
                            className="text-[10px] font-bold text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            Смотреть все ➔
                          </button>
                        </div>
                        <div className="flex gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                          {relatedManga.slice(0, 6).map((item, idx) => {
                            const data = item.type === 'anime' ? item.anime : item.manga;
                            if (!data) return null;
                            return (
                              <div
                                key={`prev-rel-${idx}`}
                                onClick={() => {
                                  if (item.type === 'anime' && item.anime) {
                                    navigate(`/anime/${item.anime.id}`);
                                  } else if (item.manga) {
                                    const nextM: MangaItem = {
                                      id: String(item.manga.id),
                                      title: item.manga.title,
                                      originalTitle: item.manga.originalTitle || '',
                                      cover: item.manga.cover || '',
                                      rating: parseFloat(item.manga.score || '8.0'),
                                      genres: [item.manga.kind === 'manhwa' ? 'Манхва' : 'Манга'],
                                      status: item.manga.status || 'Завершен',
                                      description: ''
                                    };
                                    setSelectedManga(nextM);
                                    selectMangaItem(nextM);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }
                                }}
                                className="w-28 shrink-0 bg-[#18191d] border border-white/5 hover:border-[#8B5CF6]/50 rounded-xl p-2 cursor-pointer transition-all space-y-1.5 group"
                              >
                                <div className="aspect-[2/3] rounded-lg overflow-hidden relative bg-black/40">
                                  <img 
                                    src={data.cover || FALLBACK_COVER} 
                                    alt={data.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                                  />
                                  <span className="absolute top-1 left-1 px-1 py-0.5 bg-black/80 rounded text-[7px] font-black text-[#A78BFA] uppercase">
                                    {item.type === 'anime' ? 'Аниме' : 'Манга'}
                                  </span>
                                </div>
                                <p className="text-[10px] font-bold text-white truncate group-hover:text-[#A78BFA] transition-colors">{data.title}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeDetailTab === 'related' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {loadingRelatedSimilar ? (
                      <div className="py-16 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin mb-3" />
                        <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Загрузка связанных произведений...</span>
                      </div>
                    ) : relatedManga.length === 0 ? (
                      <div className="py-16 text-center text-slate-500 font-extrabold text-xs uppercase tracking-widest border border-white/5 border-dashed rounded-3xl p-6">
                        Связанных аниме или манги не найдено в базе данных
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {relatedManga.map((item, idx) => {
                          const isAnime = item.type === 'anime' && item.anime;
                          const isMangaType = item.type === 'manga' && item.manga;
                          const data = isAnime ? item.anime : item.manga;
                          if (!data) return null;

                          return (
                            <div
                              key={`rel-${idx}`}
                              className="p-3 bg-[#18191d] border border-white/5 hover:border-[#8B5CF6]/40 rounded-2xl flex items-start gap-3 transition-all group"
                            >
                              <div className="w-16 h-22 rounded-xl overflow-hidden bg-black/40 shrink-0 border border-white/5 relative">
                                {data.cover ? (
                                  <img 
                                    src={data.cover} 
                                    alt={data.title} 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    referrerPolicy="no-referrer"
                                    onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-white/5 text-slate-600">
                                    <BookOpen className="w-6 h-6" />
                                  </div>
                                )}
                                <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[7.5px] font-black text-amber-300">
                                  ⭐ {data.score || '8.0'}
                                </span>
                              </div>

                              <div className="min-w-0 flex-1 flex flex-col justify-between self-stretch py-0.5">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-1.5 py-0.5 rounded bg-[#8B5CF6]/20 text-[#A78BFA] font-black text-[8px] uppercase tracking-wider">
                                      {item.relation}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-bold text-[8px] uppercase">
                                      {isAnime ? 'Аниме' : 'Манга'}
                                    </span>
                                  </div>
                                  <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-[#A78BFA] transition-colors">
                                    {data.title}
                                  </h4>
                                  {data.originalTitle && (
                                    <p className="text-[10px] text-slate-500 truncate font-medium">
                                      {data.originalTitle}
                                    </p>
                                  )}
                                </div>

                                <div className="pt-2">
                                  {isAnime ? (
                                    <button
                                      type="button"
                                      onClick={() => navigate(`/anime/${data.id}`)}
                                      className="w-full px-2.5 py-1.5 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                                    >
                                      <Play className="w-3 h-3 fill-current" />
                                      <span>Смотреть аниме</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextManga: MangaItem = {
                                          id: String(data.id),
                                          title: data.title,
                                          originalTitle: data.originalTitle || '',
                                          cover: data.cover || '',
                                          rating: parseFloat(data.score || '8.0'),
                                          genres: [data.kind === 'manhwa' ? 'Манхва' : 'Манга'],
                                          status: (data as any).status || 'Завершен',
                                          description: ''
                                        };
                                        setSelectedManga(nextManga);
                                        selectMangaItem(nextManga);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 hover:text-white font-black text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-white/5"
                                    >
                                      <BookOpen className="w-3 h-3" />
                                      <span>Читать мангу</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {activeDetailTab === 'similar' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {loadingRelatedSimilar ? (
                      <div className="py-16 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin mb-3" />
                        <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Подбор похожих тайтлов...</span>
                      </div>
                    ) : similarManga.length === 0 ? (
                      <div className="py-16 text-center text-slate-500 font-extrabold text-xs uppercase tracking-widest border border-white/5 border-dashed rounded-3xl p-6">
                        Похожих тайтлов пока не найдено
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                        {similarManga.map((m) => (
                          <div
                            key={m.id}
                            onClick={() => {
                              const nextManga: MangaItem = {
                                id: m.id,
                                title: m.title,
                                originalTitle: m.originalTitle || '',
                                cover: m.cover,
                                rating: m.rating,
                                genres: m.genres || ['Манга'],
                                status: m.status,
                                description: ''
                              };
                              setSelectedManga(nextManga);
                              selectMangaItem(nextManga);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="bg-[#18191d] border border-white/5 hover:border-[#8B5CF6]/50 rounded-2xl p-2.5 space-y-2 cursor-pointer transition-all hover:scale-[1.02] group flex flex-col justify-between"
                          >
                            <div className="space-y-2">
                              <div className="aspect-[2/3] rounded-xl overflow-hidden bg-black/40 relative border border-white/5">
                                <img
                                  src={m.cover}
                                  alt={m.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                                />
                                <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 rounded text-[8px] font-black text-amber-300 flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
                                  <span>{m.rating}</span>
                                </div>
                                <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/80 rounded text-[7.5px] font-black text-[#A78BFA] uppercase">
                                  {m.genres[0] || 'Манга'}
                                </div>
                              </div>

                              <div className="space-y-0.5 px-1">
                                <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-[#A78BFA] transition-colors">
                                  {m.title}
                                </h4>
                                {m.originalTitle && (
                                  <p className="text-[10px] text-slate-500 truncate font-medium">
                                    {m.originalTitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="px-1 pt-1 flex items-center justify-between text-[9px] text-slate-400 font-semibold border-t border-white/5">
                              <span>{m.status}</span>
                              <span className="text-[#8B5CF6] font-bold">Читать ➔</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeDetailTab === 'chapters' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Поиск по главе... (напр. 1 или 5)"
                        className="w-full pl-11 pr-4 py-3 bg-[#18191d] border border-white/5 focus:border-[#8B5CF6] rounded-2xl text-xs font-bold text-white placeholder-slate-500 focus:outline-none transition-all outline-none"
                        value={chapterSearchQuery}
                        onChange={(e) => setChapterSearchQuery(e.target.value)}
                      />
                      <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    </div>

                    {chaptersLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin mb-3" />
                        <span className="text-xs font-black uppercase text-slate-500 tracking-widest">Инициализация структуры глав...</span>
                      </div>
                    ) : (() => {
                      // Filter chapters by chapter search query
                      const filtered = chapters.filter((ch) => {
                        const matchSearch = ch.chapter.toLowerCase().includes(chapterSearchQuery.toLowerCase()) || 
                          (ch.title && ch.title.toLowerCase().includes(chapterSearchQuery.toLowerCase()));
                        return matchSearch;
                      });

                      return (
                        <div className="space-y-4">
                          {filtered.length === 0 ? (
                            isMangaLicensed ? (
                              <div className="py-8 px-5 text-center border border-red-500/15 bg-red-500/5 text-slate-300 rounded-3xl flex flex-col items-center gap-2">
                                <ShieldAlert className="w-8 h-8 text-red-500" />
                                <div className="font-black text-red-500 text-xs uppercase tracking-widest">Издательская блокировка</div>
                                <div className="text-[10px] text-slate-500 max-w-sm font-semibold">
                                  По требованию дистрибьютора в регионе главы закрыты для свободного просмотра. Пожалуйста, обратитесь к правообладателю.
                                </div>
                              </div>
                            ) : (
                              <div className="py-12 text-center text-slate-500 font-extrabold text-xs uppercase tracking-widest border border-white/5 border-dashed rounded-3xl">
                                Главы этого произведения еще не переведены в нашей базе
                              </div>
                            )
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                              {filtered.map((ch) => {
                                const isDownloaded = downloadedChapterIds.includes(ch.id);
                                const isDownloading = downloadingChapterId === ch.id;

                                return (
                                  <div
                                    key={ch.id}
                                    onClick={() => startReadingChapter(ch)}
                                    className="p-3.5 rounded-2xl text-left transition-all active:scale-[0.98] flex items-center justify-between cursor-pointer border bg-[#18191d] border-white/5 hover:border-[#8B5CF6] hover:bg-[#8B5CF6]/5 group"
                                  >
                                    <div className="min-w-0 pr-2">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[8px] font-black uppercase text-[#8B5CF6] tracking-wider block">Команда перевода</span>
                                        {isDownloaded && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-black text-[8px] uppercase tracking-wider flex items-center gap-0.5 border border-emerald-500/30">
                                            <CheckCircle2 className="w-2.5 h-2.5" /> Оффлайн
                                          </span>
                                        )}
                                      </div>
                                      <h4 className="text-xs font-black mt-0.5 text-white">
                                        Глава {ch.chapter}
                                      </h4>
                                      <p className="text-[10px] text-slate-400 font-semibold truncate mt-0.5">{ch.title || `Раздел`}</p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={(e) => handleDownloadChapter(e, ch, selectedManga!)}
                                        title={isDownloaded ? "Сохранено оффлайн (нажмите для удаления)" : "Скачать главу для чтения без интернета"}
                                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                          isDownloaded
                                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30'
                                            : isDownloading
                                            ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]/40 text-[#8B5CF6]'
                                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                                        }`}
                                      >
                                        {isDownloading ? (
                                          <div className="flex items-center gap-1 text-[9px] font-black">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>{downloadProgress ? `${downloadProgress.current}/${downloadProgress.total}` : ''}</span>
                                          </div>
                                        ) : isDownloaded ? (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                          <Download className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                      <ChevronRight className="w-4 h-4 shrink-0 text-slate-600 group-hover:text-white transition-colors" />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeDetailTab === 'comments' && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="bg-[#18191d] border border-white/5 p-4 rounded-2xl space-y-3">
                      <textarea 
                        rows={3}
                        placeholder="Поделитесь вашим отзывом о сюжете или переводе..."
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        className="w-full bg-[#121316] border border-white/5 hover:border-white/12 focus:border-[#8B5CF6] rounded-xl p-3.5 text-xs font-semibold text-white placeholder-slate-500 focus:outline-none transition-all outline-none resize-none"
                      />
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-[#7d8291] font-black uppercase">Выпускщик: {(user as any)?.username || user?.email?.split('@')[0] || "Гость"}</span>
                        <button 
                          onClick={leaveComment}
                          className="px-4 py-2 bg-[#8B5CF6] hover:bg-[#A855F7] text-black font-black uppercase text-[10px] tracking-widest rounded-xl shadow cursor-pointer transition-all"
                        >
                          Send comment
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {(mangaComments[selectedManga.id] || []).length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-xs font-black uppercase tracking-widest">
                          Комментариев пока нет. Станьте первым, кто оставит свой отзыв!
                        </div>
                      ) : (
                        (mangaComments[selectedManga.id] || []).map((comment) => (
                          <div key={comment.id} className="p-4 bg-[#18191d] border border-white/5 rounded-2xl flex items-start gap-4 justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-white py-0.5 px-2 bg-white/5 rounded-md">{comment.user}</span>
                                <span className="text-[9px] text-[#7d8291] font-bold">{comment.date}</span>
                              </div>
                              <p className="text-slate-300 text-xs font-medium leading-relaxed">
                                {comment.text}
                              </p>
                            </div>
                            <button 
                              onClick={() => likeComment(comment.id)}
                              className="flex items-center gap-1.5 px-2 py-1 bg-white/5 hover:bg-[#8B5CF6]/10 hover:text-[#8B5CF6] rounded-lg text-[10px] transition-all select-none"
                            >
                              <ThumbsUp className="w-3 h-3 text-[#8B5CF6] fill-current" />
                              <span>{comment.likes}</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* MANGA PORTAL HOME PAGE VIEW */}
      {selectedManga === null && activeChapter === null && (
        <div className="animate-in fade-in duration-300">
          
          {/* Section: Head Welcome Block */}
          <div className="bg-gradient-to-r from-[#8B5CF6]/5 via-[#18191d]/90 to-[#121316] border-b border-white/5 py-10 px-4 sm:px-8 lg:px-12">
            <div className="max-w-[1440px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="space-y-1">
                <h1 className="text-2xl sm:text-4xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                  KamiManga <span className="text-[#8B5CF6] font-light">Portal</span>
                </h1>
                <p className="text-xs text-[#7d8291] font-semibold max-w-2xl">
                  Мгновенный доступ ко всем мировым каталогам манги на русском языке. Плавный свитковый ридер, закладки, бесконечный скролл и умный поиск.
                </p>
              </div>

              {/* Fast Instant Search Bar */}
              <div className="relative w-full lg:w-96 flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Быстрый поиск по каталогу..."
                    className="w-full pl-10 pr-4 py-3 bg-[#18191d] border border-white/5 hover:border-[#8B5CF6]/40 focus:border-[#8B5CF6] rounded-2xl text-xs font-bold text-white placeholder-slate-500 focus:outline-none transition-all outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-[1440px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16 py-8 space-y-12">

            {/* Minimalist Portal Selector */}
            <div className="flex items-center justify-center gap-4 text-xs font-bold py-2 border-b border-white/5 max-w-xs mx-auto mb-10 select-none animate-in fade-in duration-300">
              <button
                onClick={() => {
                  if (window.location.hostname.includes('kamianime.club')) {
                    window.location.href = 'https://kamianime.club/';
                  } else {
                    localStorage.removeItem('kami_manga_mode');
                    window.location.reload();
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors cursor-pointer uppercase tracking-widest font-bold"
              >
                Аниме
              </button>
              <span className="text-white/20">/</span>
              <span className="text-[#8B5CF6] font-black uppercase tracking-widest relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-[#8B5CF6]">
                Манга
              </span>
            </div>

            {/* SECTION 0: ОФФЛАЙН МАНГА (Если есть скачанные главы) */}
            {offlineChaptersList.length > 0 && (
              <div className="space-y-4 bg-purple-950/20 border border-purple-500/20 p-4 sm:p-5 rounded-3xl animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                    <HardDriveDownload className="w-4 h-4 text-[#8B5CF6]" /> Оффлайн манга <span className="text-xs text-purple-300 font-bold">({offlineChaptersList.length} глав скачано)</span>
                  </h2>
                  <span className="text-[10px] text-emerald-400 font-extrabold uppercase px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                    <WifiOff className="w-3.5 h-3.5" /> Доступно без интернета
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {offlineChaptersList.map((off) => (
                    <div
                      key={off.id}
                      onClick={() => {
                        const chItem: ChapterItem = {
                          id: off.id,
                          chapter: off.chapterNumber,
                          volume: '1',
                          title: off.chapterTitle || `Глава ${off.chapterNumber}`,
                          group: off.group || 'Оффлайн',
                          publishAt: ''
                        };
                        const mangaItem: MangaItem = {
                          id: off.mangaId,
                          title: off.mangaTitle,
                          originalTitle: '',
                          rating: 5,
                          genres: [],
                          status: '',
                          description: '',
                          cover: off.mangaCover || FALLBACK_COVER
                        };
                        startReadingChapter(chItem, mangaItem);
                      }}
                      className="p-3 bg-[#18191d] hover:bg-[#1f2026] border border-white/5 rounded-2xl flex items-center justify-between cursor-pointer transition-all group"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        {off.mangaCover && (
                          <img src={off.mangaCover} alt="" className="w-9 h-12 object-cover rounded shadow shrink-0 border border-white/5" />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{off.mangaTitle}</h4>
                          <p className="text-[10px] font-black text-[#8B5CF6] uppercase mt-0.5">Глава {off.chapterNumber} ({off.pagesCount} стр.)</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await deleteOfflineChapter(off.id);
                          await refreshDownloadedChapters();
                        }}
                        title="Удалить из оффлайн памяти"
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SECTION 1: СВЕРХУ НЕДАВНИЕ ДОБАВЛЕНИЯ */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                  <span className="w-1.5 h-4 bg-[#8B5CF6] rounded-full inline-block animate-pulse" />
                  Недавние добавления
                </h2>
              </div>

              {loadingRecent && recentAdditions.length === 0 ? (
                <div className="py-12 flex items-center gap-3 justify-center bg-[#18191d] rounded-2xl border border-white/5">
                  <Loader2 className="w-5 h-5 animate-spin text-[#8B5CF6]" />
                  <span className="text-xs text-[#7d8291] font-bold">Синхронизация свежих баз...</span>
                </div>
              ) : (
                <div 
                  ref={recentScrollRef}
                  onScroll={handleRecentScroll}
                  className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar select-none scroll-smooth min-h-[220px]"
                >
                  {recentAdditions.map((item, idx) => (
                    <div
                      key={`recent-${item.id}-${idx}`}
                      onClick={() => setSearchParams({ mangaId: item.id })}
                      className="w-[120px] sm:w-[140px] shrink-0 group cursor-pointer space-y-2"
                    >
                      <div className="aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-xl border border-white/5 relative bg-[#18191d]">
                        <img 
                          src={item.cover} 
                          alt="" 
                          onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          referrerPolicy="no-referrer"
                          loading="lazy"
                        />
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[8px] font-black text-[#8B5CF6] uppercase">
                          NEW
                        </div>
                        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/85 rounded text-[8.5px] font-black text-white flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-current text-yellow-500" /> {item.rating}
                        </div>
                      </div>
                      <h4 className="text-[11px] font-bold text-slate-300 group-hover:text-[#8B5CF6] transition-colors leading-tight line-clamp-2">
                        {item.title}
                      </h4>
                    </div>
                  ))}
                  {loadingRecent && (
                    <div className="w-[140px] shrink-0 flex flex-col items-center justify-center p-3 text-center bg-white/5 rounded-2xl">
                      <Loader2 className="w-5 h-5 text-[#8B5CF6] animate-spin" />
                      <span className="text-[9px] text-slate-500 font-bold uppercase mt-2">Loading more...</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECTION 2: НИЖЕ СКРОЛЛОМ В БОК ПРОДОЛЖИТЬ ЧТЕНИЕ (мини карточки) */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#8B5CF6]" /> Продолжить чтение <span className="text-xs text-[#7d8291] uppercase font-semibold">({readingHistory.length})</span>
              </h2>

              {readingHistory.length === 0 ? (
                <div className="py-8 text-center text-xs font-bold text-slate-500 uppercase tracking-widest bg-[#18191d] rounded-2xl border border-white/5">
                  История чтения пуста. Начните читать любую главу!
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar select-none">
                  {readingHistory.map((hist, idx) => (
                    <div
                      key={`history-${hist.manga.id}-${idx}`}
                      onClick={() => {
                        // Directly launch reader or load detail page with chapter modal
                        setSearchParams({ mangaId: hist.manga.id });
                        setTimeout(() => {
                          startReadingChapter(hist.chapter);
                        }, 400);
                      }}
                      className="w-[200px] sm:w-[240px] shrink-0 p-3 bg-[#18191d] hover:bg-[#1f2026] border border-white/5 rounded-2xl flex gap-3 items-center cursor-pointer transition-all duration-300"
                    >
                      <img 
                        src={hist.manga.cover} 
                        alt="" 
                        onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                        className="w-10 h-14 object-cover rounded shadow-lg shrink-0 border border-white/5"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-[11px] font-black text-white truncate leading-snug">
                          {hist.manga.title}
                        </h4>
                        <span className="text-[9px] text-[#8B5CF6] font-black uppercase block mt-0.5">
                          Глава {hist.chapter.chapter}
                        </span>
                        <span className="text-[8px] text-slate-500 font-semibold block uppercase tracking-wide truncate mt-1">
                          {hist.chapter.title || "Продолжить чтение"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 3: НИЖЕ СКРОЛЛОМ В БОК СПИСКОМ ПО 5 Новинки, Сейчас читают, Популярное */}
            <div className="space-y-4">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#8B5CF6] flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Топ Списки КамиМанга
              </h2>

              {loadingLists5 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-5 bg-[#18191d] rounded-2xl border border-white/5 animate-pulse min-h-[300px]" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Column A: Новинки */}
                  <div className="bg-[#18191d] p-5 rounded-2xl border border-white/5 space-y-4">
                    <h3 className="text-xs font-black uppercase text-white border-b border-white/5 pb-2 flex justify-between items-center">
                      <span>НОВИНКИ</span>
                      <span className="text-[9px] text-green-400">СВЕЖЕЕ</span>
                    </h3>
                    <div className="space-y-3">
                      {novinki5.map((item, idx) => (
                        <div 
                          key={`nov5-${item.id}`} 
                          onClick={() => setSearchParams({ mangaId: item.id })}
                          className="flex items-center gap-3 hover:bg-white/5 p-1 rounded-xl cursor-pointer transition-colors"
                        >
                          <span className="text-xs font-black text-slate-600 w-4 block text-center">#{idx + 1}</span>
                          <img 
                            src={item.cover} 
                            alt="" 
                            onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                            className="w-8 h-11 object-cover rounded-md border border-white/5"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="min-w-0 pr-1">
                            <h4 className="text-[11px] font-bold text-slate-300 truncate leading-snug">{item.title}</h4>
                            <span className="text-[8px] text-slate-500 uppercase font-black">{item.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column B: Сейчас читают */}
                  <div className="bg-[#18191d] p-5 rounded-2xl border border-white/5 space-y-4">
                    <h3 className="text-xs font-black uppercase text-[#8B5CF6] border-b border-white/5 pb-2 flex justify-between items-center">
                      <span>СЕЙЧАС ЧИТАЮТ</span>
                      <span className="text-[9px] text-[#8B5CF6] font-extrabold">АКТИВНО</span>
                    </h3>
                    <div className="space-y-3">
                      {nowReading5.map((item, idx) => (
                        <div 
                          key={`read5-${item.id}`} 
                          onClick={() => setSearchParams({ mangaId: item.id })}
                          className="flex items-center gap-3 hover:bg-white/5 p-1 rounded-xl cursor-pointer transition-colors"
                        >
                          <span className="text-xs font-black text-slate-600 w-4 block text-center">#{idx + 1}</span>
                          <img 
                            src={item.cover} 
                            alt="" 
                            onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                            className="w-8 h-11 object-cover rounded-md border border-white/5"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="min-w-0 pr-1">
                            <h4 className="text-[11px] font-bold text-slate-300 truncate leading-snug">{item.title}</h4>
                            <span className="text-[8px] text-slate-500 uppercase font-black">{item.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Column C: Популярное */}
                  <div className="bg-[#18191d] p-5 rounded-2xl border border-white/5 space-y-4">
                    <h3 className="text-xs font-black uppercase text-white border-b border-white/5 pb-2 flex justify-between items-center">
                      <span>ПОПУЛЯРНОЕ</span>
                      <span className="text-[9px] text-[#8B5CF6]">RECOMMENDED</span>
                    </h3>
                    <div className="space-y-3">
                      {popular5.map((item, idx) => (
                        <div 
                          key={`pop5-${item.id}`} 
                          onClick={() => setSearchParams({ mangaId: item.id })}
                          className="flex items-center gap-3 hover:bg-white/5 p-1 rounded-xl cursor-pointer transition-colors"
                        >
                          <span className="text-xs font-black text-slate-600 w-4 block text-center">#{idx + 1}</span>
                          <img 
                            src={item.cover} 
                            alt="" 
                            onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                            className="w-8 h-11 object-cover rounded-md border border-white/5"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="min-w-0 pr-1">
                            <h4 className="text-[11px] font-bold text-slate-300 truncate leading-snug">{item.title}</h4>
                            <span className="text-[8.5px] font-black text-[#8B5CF6]">{item.rating}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* DETAILED CHAPTERS FULL SCREEN HIGH-CONTRAST READER */}
      <AnimatePresence>
        {selectedManga && activeChapter !== null && (() => {
          const activeIndex = chapters.findIndex(c => c.id === activeChapter.id);
          const prevChapter = activeIndex > 0 ? chapters[activeIndex - 1] : null;
          const nextChapter = activeIndex < chapters.length - 1 ? chapters[activeIndex + 1] : null;

          const activeBgClass = 
            readingBg === 'gray' ? 'bg-[#1e1f24] text-slate-200' :
            readingBg === 'sepia' ? 'bg-[#2c241b] text-[#f3ece0]' :
            readingBg === 'light' ? 'bg-[#f7f7f9] text-[#1a1b1f]' : 
            'bg-[#0b0c0e] text-slate-300';

          const activeContainerWidthStyle = readingWidth === 'full' ? '100%' : `${readingWidth}px`;

          const activeGapClass = 
            readingGap === '8' ? 'gap-2 py-2' :
            readingGap === '16' ? 'gap-4 py-4' :
            readingGap === '32' ? 'gap-8 py-8' :
            readingGap === '48' ? 'gap-12 py-12' :
            readingGap === '64' ? 'gap-16 py-16' :
            'gap-0 py-0';

          return (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-[125] flex flex-col justify-between overflow-hidden ${activeBgClass}`}
            >
              {/* Sticky Top Reader toolbars */}
              <div className="bg-[#121316] px-4 py-3.5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 z-50 shadow-md">
                <div className="flex items-center gap-3 min-w-0">
                  <button 
                    onClick={() => { setActiveChapter(null); setMangaReaderPage(0); }}
                    className="p-2.5 bg-white/5 text-slate-300 hover:text-[#8B5CF6] hover:bg-white/10 rounded-xl transition-all shrink-0 cursor-pointer animate-in fade-in duration-200"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-[9px] text-[#8B5CF6] uppercase tracking-wider truncate max-w-[120px] md:max-w-[200px]">
                      {selectedManga.title}
                    </h3>
                    
                    {/* Chapter Select menu & Quick Jump */}
                    <div className="relative inline-block text-left mt-0.5 group/chdrop select-none">
                      <button 
                        onClick={() => setIsChapterJumpModalOpen(true)}
                        className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-white hover:text-[#8B5CF6] transition-colors focus:outline-none cursor-pointer"
                        title="Нажмите для быстрого перехода к любой главе"
                      >
                        <span>Глава {activeChapter.chapter}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-[#8B5CF6]" />
                      </button>

                      <div className="absolute left-0 top-full mt-2 w-72 bg-[#18191d] border border-white/10 rounded-2xl p-2.5 shadow-2xl overflow-hidden hidden group-hover/chdrop:block hover:block z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5 mb-1.5">
                          <span className="text-[9px] font-black tracking-wider text-[#7d8291] uppercase">
                            Главы ({chapters.length})
                          </span>
                          <button
                            onClick={() => setIsChapterJumpModalOpen(true)}
                            className="text-[9px] font-bold text-[#8B5CF6] hover:underline uppercase"
                          >
                            Быстрый ввод
                          </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar p-1 space-y-1">
                          {chapters.map((ch) => (
                            <button
                              key={ch.id}
                              onClick={() => startReadingChapter(ch)}
                              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                                ch.id === activeChapter.id
                                  ? "bg-[#8B5CF6] text-black shadow-md font-black"
                                  : "text-slate-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <span className="truncate">Глава {ch.chapter} {ch.title ? `— ${ch.title}` : ''}</span>
                              {ch.id === activeChapter.id && <span className="text-[9px] uppercase tracking-wider ml-1 bg-black/20 px-1.5 py-0.5 rounded">Чтение</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 select-none">
                  {/* Prev Chapter */}
                  <button
                    disabled={!prevChapter}
                    onClick={() => prevChapter && startReadingChapter(prevChapter)}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase text-slate-300 disabled:opacity-20 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline text-[9px]">Пред.</span>
                  </button>

                  <div className="bg-black/45 border border-white/5 rounded-xl p-0.5 flex">
                    <button
                      onClick={() => handleSetReaderMode('pages')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        readerMode === 'pages' ? 'bg-[#8B5CF6] text-black' : 'text-[#7d8291]'
                      }`}
                    >
                      Постранично
                    </button>
                    <button
                      onClick={() => handleSetReaderMode('scroll')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                        readerMode === 'scroll' ? 'bg-[#8B5CF6] text-black' : 'text-[#7d8291]'
                      }`}
                    >
                      Свиток
                    </button>
                  </div>

                  <button 
                    onClick={() => setIsSettingsOpen(prev => !prev)}
                    className={`p-2 bg-white/5 text-slate-300 rounded-xl transition-all ${isSettingsOpen ? 'text-[#8B5CF6] bg-[#8B5CF6]/10 animate-pulse' : 'hover:bg-white/10'}`}
                  >
                    <Settings className="w-4 h-4" />
                  </button>

                  {/* Next Chapter */}
                  <button
                    disabled={!nextChapter}
                    onClick={() => nextChapter && startReadingChapter(nextChapter)}
                    className="px-3 py-2 bg-[#8B5CF6] hover:bg-[#A855F7] text-xs font-black uppercase text-black disabled:opacity-20 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span className="hidden sm:inline text-[9px]">След.</span> <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Reader canvas space */}
              <div className="flex-1 flex relative overflow-hidden">
                <div className="flex-1 overflow-y-auto flex flex-col items-center custom-scrollbar relative z-10 w-full">
                  {pagesLoading ? (
                    <div className="m-auto flex flex-col items-center justify-center p-6 text-center">
                      <Loader2 className="w-10 h-10 text-[#8B5CF6] animate-spin mb-4" />
                      <span className="text-xs font-black uppercase text-slate-400 tracking-widest animate-pulse">Загрузка страниц из API...</span>
                    </div>
                  ) : chapterPagesError === 'licensed' ? (
                    /* Highly polished inside-reader licensed block */
                    <div className="m-auto w-full max-w-xl py-12 px-6 bg-[#18191d] border border-red-500/15 rounded-3xl text-center space-y-6 shadow-2xl mx-4 animate-in zoom-in-95 duration-200">
                      <div className="w-16 h-16 bg-red-550/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
                        <ShieldAlert className="w-8 h-8 text-red-500" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-red-500 uppercase tracking-widest">ДОСТУП ОГРАНИЧЕН: РФ ПРАВООБЛАДАТЕЛЬ</h4>
                        <p className="text-[11px] text-[#7d8291] max-w-sm mx-auto leading-relaxed font-semibold">
                          По требованию дистрибьютора в регионе главы закрыты для свободного просмотра. 
                          Главы этого произведения удалены правообладателем в РФ или заблокированы.
                        </p>
                      </div>
                      <div className="p-3 bg-[#121316] rounded-2xl border border-white/5 text-left text-[9px] font-mono text-red-400/80 leading-snug break-all space-y-1">
                        <div>[Статус: Лицензионная защита региона]</div>
                        <div>Chapter pages fetch returned license status.</div>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-center gap-2 pt-2">
                        <button
                          onClick={() => { setActiveChapter(null); setMangaReaderPage(0); }}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-[#a5a7b1] rounded-xl transition-all cursor-pointer"
                        >
                          Назад к описанию
                        </button>
                        {prevChapter && (
                          <button
                            onClick={() => startReadingChapter(prevChapter)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-slate-300 rounded-xl transition-all cursor-pointer border border-white/5"
                          >
                            Предыдущая глава
                          </button>
                        )}
                        {nextChapter && (
                          <button
                            onClick={() => startReadingChapter(nextChapter)}
                            className="px-4 py-2 bg-[#8B5CF6] text-black hover:bg-[#A855F7] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md cursor-pointer"
                          >
                            Гл. {nextChapter.chapter}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (chapterPagesError || pages.length === 0) ? (
                    <div className="m-auto flex flex-col items-center justify-center p-6 text-center max-w-xl space-y-4 animate-in fade-in duration-200">
                      <div className="p-4 bg-white/5 rounded-full border border-white/5 animate-pulse">
                        <BookOpen className="w-8 h-8 text-[#7d8291]" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-black uppercase text-white tracking-wider">Страницы не загрузились</h3>
                        <p className="text-[10px] text-slate-500 max-w-xs leading-normal mx-auto">
                          Не удалось получить страницы этой главы из источника. Пожалуйста, попробуйте обновить или выбрать другой перевод/главу.
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full max-w-md items-center justify-center">
                        <button
                          onClick={() => activeChapter && startReadingChapter(activeChapter)}
                          className="px-5 py-2.5 bg-[#8B5CF6] hover:bg-[#A855F7] text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Повторить загрузку
                        </button>
                        <button
                          onClick={() => { setActiveChapter(null); setMangaReaderPage(0); }}
                          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-[#a5a7b1] rounded-xl transition-all cursor-pointer"
                        >
                          К списку глав
                        </button>
                      </div>

                        {activeDebugLogs.length > 0 && (
                          <div className="w-full mt-4 bg-black/40 border border-white/5 rounded-xl p-3 text-left space-y-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block border-b border-white/5 pb-1">Отладочные логи сервера:</span>
                            <div className="max-h-40 overflow-y-auto font-mono text-[9px] text-[#A855F7]/80 space-y-1 custom-scrollbar select-text leading-relaxed">
                              {activeDebugLogs.map((log, lidx) => (
                                <div key={lidx} className="break-all border-b border-white/5 pb-0.5">{log}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                  ) : readerMode === 'scroll' ? (
                    <div 
                      className={`w-full flex flex-col items-center ${activeGapClass}`}
                      style={{ maxWidth: activeContainerWidthStyle }}
                    >
                      {pages.map((imgUrl, idx) => (
                        <div key={idx} className={`relative w-full select-none ${readingGap !== '0' ? 'shadow-2xl' : ''}`}>
                          <img 
                            src={imgUrl} 
                            alt={`Page-${idx + 1}`} 
                            onError={(e) => { 
                              const currentSrc = e.currentTarget.src;
                              if (currentSrc.includes('/api/manga/page-proxy?url=')) {
                                try {
                                  const urlParams = new URL(currentSrc);
                                  const rawUrl = urlParams.searchParams.get('url');
                                  if (rawUrl) {
                                    e.currentTarget.src = rawUrl;
                                    return;
                                  }
                                } catch (err) {}
                              }
                              e.currentTarget.style.display = 'none'; 
                            }}
                            className="w-full object-contain mx-auto"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="absolute bottom-3 right-4 bg-black/80 backdrop-blur-md text-[8.5px] font-black uppercase tracking-wide text-slate-400 py-1 px-2.5 rounded border border-white/5 opacity-40 hover:opacity-100 transition-opacity">
                            Стр. {idx + 1} / {pages.length}
                          </div>
                        </div>
                      ))}

                      {/* Chapter finished box */}
                      <div className="w-full max-w-xl py-12 px-6 bg-[#18191d] border border-white/5 rounded-3xl text-center space-y-4 my-6 select-none relative z-20 mx-4 shadow-2xl">
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">Глава Завершена</h4>
                        <p className="text-[11px] text-[#7d8291] max-w-xs mx-auto">Вы закончили главу {activeChapter.chapter}. Понравилась манга? Продолжайте чтение следующем разделом!</p>
                        <div className="flex justify-center gap-2 pt-2">
                          <button
                            onClick={() => { setActiveChapter(null); setMangaReaderPage(0); }}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-[#a5a7b1] rounded-xl transition-all"
                          >
                            В Описание
                          </button>
                          {nextChapter && (
                            <button
                              onClick={() => startReadingChapter(nextChapter)}
                              className="px-5 py-2 bg-[#8B5CF6] text-black hover:bg-[#A855F7] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md"
                            >
                              Гл. {nextChapter.chapter}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-grow flex flex-col justify-between w-full h-full">
                      {mangaReaderPage >= pages.length ? (
                        /* Chapter finished state panel */
                        <div className="m-auto w-full max-w-xl py-12 px-6 bg-[#18191d] border border-white/5 rounded-3xl text-center space-y-4 shadow-2xl">
                          <h4 className="text-sm font-black text-white uppercase tracking-wider">Глава Завершена</h4>
                          <p className="text-[11px] text-[#7d8291] max-w-xs mx-auto">Вы закончили главу {activeChapter.chapter}. Понравилась манга? Продолжайте чтение следующем разделом!</p>
                          <div className="flex justify-center gap-2 pt-2">
                            <button
                              onClick={() => { setActiveChapter(null); setMangaReaderPage(0); }}
                              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-[#a5a7b1] rounded-xl transition-all"
                            >
                              В Описание
                            </button>
                            {nextChapter && (
                              <button
                                onClick={() => startReadingChapter(nextChapter)}
                                className="px-5 py-2 bg-[#8B5CF6] text-black hover:bg-[#A855F7] text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md"
                              >
                                  Гл. {nextChapter.chapter}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Page reader view */
                        <div className="flex-grow flex flex-col items-center justify-center p-2 sm:p-4 min-h-0 relative w-full overflow-hidden select-none">
                          
                          {/* Main responsive image wrapper based on fit mode */}
                          <div 
                            className={`relative flex items-center justify-center transition-all duration-300 w-full rounded-2xl group ${
                              imageFitMode === 'height' ? 'h-[calc(100vh-140px)] max-w-none' :
                              imageFitMode === 'auto' ? 'max-h-[calc(100vh-140px)] h-full overflow-hidden' :
                              imageFitMode === 'original' ? 'max-h-[calc(100vh-140px)] overflow-auto bg-black/10' :
                              /* width mode */ 'max-h-[calc(100vh-140px)] overflow-y-auto custom-scrollbar'
                            }`}
                            style={{ 
                              maxWidth: (imageFitMode === 'height' || imageFitMode === 'auto') ? undefined : activeContainerWidthStyle 
                            }}
                          >
                            <div className="relative max-w-full max-h-full flex items-center justify-center select-none">
                              <img 
                                src={pages[mangaReaderPage]} 
                                alt={`Page ${mangaReaderPage + 1}`} 
                                onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                                className={`rounded-xl shadow-2xl transition-all duration-205 ${
                                  imageFitMode === 'height' ? 'h-full w-auto max-w-none object-contain' :
                                  imageFitMode === 'auto' ? 'max-h-[calc(100vh-140px)] max-w-full object-contain' :
                                  imageFitMode === 'original' ? 'h-auto w-auto object-none' :
                                  /* width mode */ 'w-full h-auto object-contain'
                                }`}
                                referrerPolicy="no-referrer"
                              />

                              {/* Click zones for left 30%, middle 40% (toggle settings), right 30% */}
                              <div className="absolute inset-0 flex select-none z-20">
                                {/* Left click zone */}
                                <div 
                                  onClick={() => {
                                    if (readingDirection === 'rtl') {
                                      // RTL forward
                                      if (mangaReaderPage < pages.length - 1) {
                                        setMangaReaderPage(prev => prev + 1);
                                      } else {
                                        setMangaReaderPage(pages.length); // Chapter finished
                                      }
                                    } else {
                                      // LTR backward
                                      if (mangaReaderPage > 0) setMangaReaderPage(prev => prev - 1);
                                    }
                                  }}
                                  className="w-[30%] h-full cursor-w-resize"
                                  title={readingDirection === 'rtl' ? "Вперед" : "Назад"}
                                />
                                
                                {/* Middle click zone (toggles sidebar settings) */}
                                <div 
                                  onClick={() => setIsSettingsOpen(prev => !prev)}
                                  className="w-[40%] h-full cursor-pointer flex items-center justify-center text-[#8B5CF6] opacity-0 hover:opacity-100 transition-opacity bg-black/10 group-hover:bg-transparent"
                                >
                                  <span className="bg-black/85 backdrop-blur-md border border-white/5 py-1.5 px-3.5 rounded-lg text-[9px] font-black uppercase tracking-wider text-[#8B5CF6]">
                                    Параметры <Settings className="w-3 h-3 inline ml-1" />
                                  </span>
                                </div>

                                {/* Right click zone */}
                                <div 
                                  onClick={() => {
                                    if (readingDirection === 'rtl') {
                                      // RTL backward
                                      if (mangaReaderPage > 0) setMangaReaderPage(prev => prev - 1);
                                    } else {
                                      // LTR forward
                                      if (mangaReaderPage < pages.length - 1) {
                                        setMangaReaderPage(prev => prev + 1);
                                      } else {
                                        // Next chapter triggers finished page
                                        setMangaReaderPage(pages.length);
                                      }
                                    }
                                  }}
                                  className="w-[30%] h-full cursor-e-resize"
                                  title={readingDirection === 'rtl' ? "Назад" : "Вперед"}
                                />
                              </div>

                              {/* Responsive absolute left/right visual chevron indicators */}
                              <button 
                                disabled={readingDirection === 'rtl' ? (mangaReaderPage >= pages.length - 1) : (mangaReaderPage === 0)}
                                onClick={() => {
                                  if (readingDirection === 'rtl') {
                                    setMangaReaderPage(prev => prev + 1);
                                  } else {
                                    setMangaReaderPage(prev => prev - 1);
                                  }
                                }}
                                className="absolute left-3 w-8 h-8 rounded-full bg-black/60 border border-white/5 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity select-none z-30 disabled:opacity-0 disabled:cursor-default"
                              >
                                <ChevronLeft className="w-5 h-5" />
                              </button>

                              <button 
                                onClick={() => {
                                  if (readingDirection === 'rtl') {
                                    if (mangaReaderPage > 0) {
                                      setMangaReaderPage(prev => prev - 1);
                                    }
                                  } else {
                                    if (mangaReaderPage < pages.length - 1) {
                                      setMangaReaderPage(prev => prev + 1);
                                    } else {
                                      setMangaReaderPage(pages.length);
                                    }
                                  }
                                }}
                                className="absolute right-3 w-8 h-8 rounded-full bg-black/60 border border-white/5 flex items-center justify-center text-white opacity-0 hover:opacity-100 transition-opacity select-none z-30"
                              >
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottom indicator & navigation panel */}
                      <div className="bg-[#121316] py-3 px-4 flex items-center justify-between border-t border-white/5 select-none z-10 max-h-14 shrink-0 gap-4">
                        <button
                          disabled={mangaReaderPage === 0}
                          onClick={() => { if (mangaReaderPage > 0) setMangaReaderPage(prev => prev - 1); }}
                          className="px-3 py-1.5 bg-white/5 hover:bg-white/10 hover:text-white text-[10px] font-black uppercase text-slate-300 disabled:opacity-20 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Назад
                        </button>

                        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar select-none py-1">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#8B5CF6] whitespace-nowrap bg-[#8B5CF6]/5 rounded-lg px-2.5 py-1 border border-[#8B5CF6]/10">
                            {mangaReaderPage >= pages.length ? 'Глава завершена' : `Страница ${mangaReaderPage + 1} из ${pages.length}`}
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            if (mangaReaderPage < pages.length - 1) {
                              setMangaReaderPage(prev => prev + 1);
                            } else {
                              setMangaReaderPage(pages.length);
                            }
                          }}
                          className="px-3.5 py-1.5 bg-[#8B5CF6] hover:bg-[#A855F7] text-[10px] font-black uppercase text-black rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 font-bold"
                        >
                          {mangaReaderPage >= pages.length - 1 ? (nextChapter ? 'След. глава' : 'Завершить') : 'Вперед'} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Settings Drawer Slide panel */}
                <AnimatePresence>
                  {isSettingsOpen && (
                    <motion.div
                      initial={{ opacity: 0, x: 100 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 100 }}
                      transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                      className="absolute right-0 top-0 bottom-0 w-80 bg-[#121316] border-l border-white/5 z-40 p-5 space-y-6 shadow-2xl flex flex-col justify-between overflow-y-auto"
                    >
                      <div className="space-y-5">
                        <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                          <span className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
                            <Sliders className="w-4 h-4 text-[#8B5CF6]" /> Панель Параметров
                          </span>
                          <button 
                            onClick={() => setIsSettingsOpen(false)}
                            className="text-xs font-bold text-[#7d8291] hover:text-white cursor-pointer hover:underline"
                          >
                            Скрыть
                          </button>
                        </div>

                        {/* Theme switcher */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Цветовая гамма</span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { id: 'dark', label: 'Ночь', cls: 'bg-[#0f0f10] border-white/10 text-slate-200' },
                              { id: 'gray', label: 'Графит', cls: 'bg-[#1e1f24] border-white/10 text-white' },
                              { id: 'sepia', label: 'Сепия', cls: 'bg-[#2c241b] border-amber-900/50 text-[#f3ece0]' },
                              { id: 'light', label: 'День', cls: 'bg-[#f7f7f9] border-slate-300 text-black' }
                            ].map(theme => (
                              <button
                                key={theme.id}
                                onClick={() => handleSetReadingBg(theme.id as any)}
                                className={`p-1 py-2 rounded text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${theme.cls} ${
                                  readingBg === theme.id ? 'ring-2 ring-[#8B5CF6] scale-105' : 'opacity-65 hover:opacity-100'
                                }`}
                              >
                                {theme.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Mode Switcher inside settings too! */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Способ чтения</span>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'scroll', label: 'Свиток (Webtoon)' },
                              { id: 'pages', label: 'Постранично' }
                            ].map(mode => (
                              <button
                                key={mode.id}
                                onClick={() => handleSetReaderMode(mode.id as any)}
                                className={`py-2 border rounded text-[9px] font-extrabold uppercase bg-black/40 border-white/10 text-slate-300 transition-all cursor-pointer ${
                                  readerMode === mode.id ? 'text-[#8B5CF6] border-[#8B5CF6]/50 bg-[#8B5CF6]/5 font-bold' : 'hover:bg-white/5'
                                }`}
                              >
                                {mode.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reading direction for page-by-page */}
                        {readerMode === 'pages' && (
                          <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                            <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Направление страниц</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { id: 'ltr', label: 'Слева направо' },
                                { id: 'rtl', label: 'Справа налево (Яп.)' }
                              ].map(dir => (
                                <button
                                  key={dir.id}
                                  onClick={() => handleSetReadingDirection(dir.id as any)}
                                  className={`py-2 border rounded text-[9px] font-extrabold uppercase bg-black/40 border-white/10 text-slate-300 transition-all cursor-pointer ${
                                    readingDirection === dir.id ? 'text-[#8B5CF6] border-[#8B5CF6]/50 bg-[#8B5CF6]/5 font-bold' : 'hover:bg-white/5'
                                  }`}
                                >
                                  {dir.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Width */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Максимальная ширина</span>
                          <div className="grid grid-cols-4 gap-1.5">
                            {[
                              { id: '500', label: '500px' },
                              { id: '650', label: '650px' },
                              { id: '800', label: '800px' },
                              { id: '950', label: '950px' },
                              { id: '1100', label: '1100px' },
                              { id: '1300', label: '1300px' },
                              { id: '1500', label: '1500px' },
                              { id: 'full', label: '100% Вся' }
                            ].map(width => (
                              <button
                                key={width.id}
                                onClick={() => handleSetReadingWidth(width.id)}
                                className={`py-1.5 border rounded text-[9px] font-extrabold uppercase bg-black/45 border-white/10 text-slate-300 transition-all cursor-pointer ${
                                  readingWidth === width.id ? 'text-[#8B5CF6] border-[#8B5CF6]/45 bg-[#8B5CF6]/5 font-bold' : 'hover:bg-white/5'
                                }`}
                              >
                                {width.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Gaps - only for scroll */}
                        {readerMode === 'scroll' && (
                          <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                            <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Шов / Отступы страниц</span>
                            <div className="grid grid-cols-6 gap-1">
                              {[
                                { id: '0', label: '0px' },
                                { id: '8', label: '8px' },
                                { id: '16', label: '16px' },
                                { id: '32', label: '32px' },
                                { id: '48', label: '48px' },
                                { id: '64', label: '64px' }
                              ].map(gap => (
                                <button
                                  key={gap.id}
                                  onClick={() => handleSetReadingGap(gap.id)}
                                  className={`py-1.5 border rounded text-[8px] font-extrabold uppercase bg-black/45 border-white/10 text-slate-300 transition-all cursor-pointer ${
                                    readingGap === gap.id ? 'text-[#8B5CF6] border-[#8B5CF6]/45 bg-[#8B5CF6]/5 font-bold' : 'hover:bg-white/5'
                                  }`}
                                >
                                  {gap.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Image Page Fit Mode */}
                        {readerMode === 'pages' && (
                          <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                            <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block font-bold">Вписывание страниц</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { id: 'width', label: 'Прокрутка (Ширина)' },
                                { id: 'height', label: 'По высоте' },
                                { id: 'auto', label: 'Авто (В весь экран)' },
                                { id: 'original', label: 'Оригинал (1:1)' }
                              ].map(fit => (
                                <button
                                  key={fit.id}
                                  onClick={() => handleSetImageFitMode(fit.id as any)}
                                  className={`py-2 border rounded text-[9px] font-extrabold uppercase bg-black/45 border-white/10 text-slate-400 transition-all cursor-pointer ${
                                    imageFitMode === fit.id ? 'text-[#8B5CF6] border-[#8B5CF6]/45 bg-[#8B5CF6]/5 font-bold' : 'hover:bg-white/5'
                                  }`}
                                >
                                  {fit.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 select-none border-t border-white/5 pt-3">
                        <span className="text-[8px] font-black uppercase tracking-widest text-[#7d8291] block text-center">Плеер KamiManga v1.4</span>
                        <button 
                          onClick={() => setIsSettingsOpen(false)}
                          className="w-full py-2 bg-[#8B5CF6] text-black hover:bg-[#A855F7] text-xs font-black uppercase tracking-wider rounded-lg transition-all text-center shrink-0 block cursor-pointer font-bold"
                        >
                          Сохранить параметры
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quick Jump to Chapter Modal Dialog */}
              <AnimatePresence>
                {isChapterJumpModalOpen && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 10 }}
                      className="bg-[#18191d] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-sm text-white">Переход к главе</h3>
                            <p className="text-[11px] text-slate-400">Всего доступно глав: {chapters.length}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setIsChapterJumpModalOpen(false);
                            setChapterJumpInput('');
                          }}
                          className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const targetNum = chapterJumpInput.trim();
                          if (!targetNum) return;
                          
                          // Find exact match or closest numeric match
                          const found = chapters.find(c => c.chapter.toString() === targetNum || c.chapter.toString().startsWith(targetNum));
                          if (found) {
                            startReadingChapter(found);
                            setIsChapterJumpModalOpen(false);
                            setChapterJumpInput('');
                          } else {
                            // Try numeric parse
                            const num = parseFloat(targetNum);
                            if (!isNaN(num)) {
                              const closest = [...chapters].sort((a, b) => {
                                const diffA = Math.abs(parseFloat(a.chapter) - num);
                                const diffB = Math.abs(parseFloat(b.chapter) - num);
                                return diffA - diffB;
                              })[0];
                              if (closest) {
                                startReadingChapter(closest);
                                setIsChapterJumpModalOpen(false);
                                setChapterJumpInput('');
                              }
                            }
                          }
                        }}
                        className="space-y-4"
                      >
                        <div>
                          <label className="text-xs font-bold text-slate-300 block mb-1.5">Введите номер главы</label>
                          <input
                            type="text"
                            autoFocus
                            placeholder={`Например: ${chapters[0]?.chapter || '1'}`}
                            value={chapterJumpInput}
                            onChange={(e) => setChapterJumpInput(e.target.value)}
                            className="w-full h-12 px-4 bg-black/40 border border-white/10 focus:border-[#8B5CF6] rounded-2xl text-white outline-none font-bold text-sm"
                          />
                        </div>

                        {/* List of matched or quick chapter chips */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-black uppercase text-[#7d8291] tracking-wider block">
                            Быстрый выбор:
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-1">
                            {chapters
                              .filter(c => !chapterJumpInput || c.chapter.toString().includes(chapterJumpInput.trim()) || (c.title && c.title.toLowerCase().includes(chapterJumpInput.toLowerCase().trim())))
                              .slice(0, 15)
                              .map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    startReadingChapter(c);
                                    setIsChapterJumpModalOpen(false);
                                    setChapterJumpInput('');
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                    c.id === activeChapter.id
                                      ? 'bg-[#8B5CF6] text-black font-black'
                                      : 'bg-white/5 text-slate-300 hover:bg-white/15 hover:text-white border border-white/5'
                                  }`}
                                >
                                  Гл. {c.chapter}
                                </button>
                              ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsChapterJumpModalOpen(false);
                              setChapterJumpInput('');
                            }}
                            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                          >
                            Отмена
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-[#8B5CF6] text-black hover:bg-[#A855F7] transition-all shadow-lg shadow-[#8B5CF6]/20"
                          >
                            Перейти
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })()}
      </AnimatePresence>

    </div>
  );
};

export default Manga;
