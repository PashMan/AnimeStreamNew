import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, Check, Tag, Heart, Star, Sliders, BookOpen, SlidersHorizontal } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AnimeCard from '../components/AnimeCard';
import { fetchAnimes, GENRE_MAP } from '../services/shikimori';
import { Anime, MangaItem } from '../types';
import SEO from '../components/SEO';

const FALLBACK_COVER = "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80";

const Catalog: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isMangaMode = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('manga.') || 
    localStorage.getItem('kami_manga_mode') === 'true'
  );

  // --- ANIME CATALOG STATES ---
  const initialQuery = searchParams.get('q') || '';
  const initialSort = searchParams.get('sort') || 'popularity';
  const initialStatus = searchParams.get('status') || 'All';
  
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>(initialStatus);
  const [currentSort, setCurrentSort] = useState(initialSort);
  const [showGenreFilters, setShowGenreFilters] = useState(false);
  
  const [animeList, setAnimeList] = useState<Anime[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // --- MANGA CATALOG STATES ---
  const [catalogMangas, setCatalogMangas] = useState<MangaItem[]>([]);
  const [catalogOffset, setCatalogOffset] = useState<number>(0);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(false);
  const [catalogHasMore, setCatalogHasMore] = useState<boolean>(true);
  const [catalogLimit] = useState<number>(24);
  const [catalogSort, setCatalogSort] = useState<string>('followedCount'); // followedCount, createdAt, rating
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterGenre, setFilterGenre] = useState<string>('all');
  const [filterChapters, setFilterChapters] = useState<string>('all');

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kami_manga_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allUniqueGenres = ["Экшен", "Фэнтези", "Исекай", "Драма", "Комедия", "Романтика", "Приключения", "Сёнен", "Культивация", "Мистика", "Ужасы"];

  // Procedural generator for endlessness support
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
    const description = `Увлекательный русский перевод невероятной истории о великих свершениях и внутренней силе. Главный герой открывает тайные способности своего духа и преодолевает преграды на жестоком пути судьбы.`;

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

  // --- ANIME LOADING LOGIC ---
  useEffect(() => {
    if (isMangaMode) return;
    let isMounted = true;
    const loadInitial = async () => {
      setIsLoading(true);
      setPage(1);
      
      const shikimoriOrderMap: Record<string, string> = {
        'popularity': 'popularity',
        'rating': 'ranked',
        'new': 'aired_on',
        'random': 'random'
      };

      const params: any = { 
        page: 1, 
        order: shikimoriOrderMap[currentSort] || 'popularity',
        search: searchQuery || undefined 
      };
      
      if (selectedGenres.length > 0) params.genre = selectedGenres.join(',');
      if (selectedStatus !== 'All') params.status = selectedStatus;

      const results = await fetchAnimes(params);
      if (isMounted) {
        setAnimeList(results);
        setHasMore((results as any).hasMore ?? results.length > 0);
        setIsLoading(false);
      }
    };

    const timer = setTimeout(loadInitial, 300);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedGenres, selectedStatus, currentSort, isMangaMode]);

  const handleLoadMoreAnime = useCallback(async () => {
    if (isLoadingMore || !hasMore || isMangaMode) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    
    const params: any = { 
        page: nextPage, 
        order: currentSort === 'rating' ? 'ranked' : (currentSort === 'new' ? 'aired_on' : 'popularity'), 
        search: searchQuery || undefined 
    };
    
    if (selectedGenres.length > 0) params.genre = selectedGenres.join(',');
    if (selectedStatus !== 'All') params.status = selectedStatus;

    const newResults = await fetchAnimes(params);
    if (newResults && newResults.length > 0) {
        setAnimeList(prev => [...prev, ...newResults]);
        setPage(nextPage);
        setHasMore((newResults as any).hasMore ?? newResults.length > 0);
    } else {
        setHasMore(false);
    }
    setIsLoadingMore(false);
  }, [isLoadingMore, hasMore, page, currentSort, searchQuery, selectedGenres, selectedStatus, isMangaMode]);

  // --- MANGA LOADING & FILTERING LOGIC ---
  const fetchMangaCatalog = async (reset: boolean = false) => {
    if (catalogLoading) return;
    setCatalogLoading(true);
    const newOffset = reset ? 0 : catalogOffset;

    try {
      // Fetch only manga that has translatedLanguage ru (Russian translation only search filter!)
      const res = await fetch(
        `/api/manga/search?limit=${catalogLimit}&offset=${newOffset}&q=${encodeURIComponent(searchQuery)}&order=${catalogSort}`
      );
      if (res.ok) {
        const data = await res.json();
        const apiResults = data.results || [];

        // Apply visual front-end filtering
        let filtered = apiResults.filter((m: MangaItem) => {
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

          if (filterChapters !== 'all') {
            const chCount = (m as any).chapters || 0;
            if (filterChapters === '1-10' && (chCount < 1 || chCount > 10)) return false;
            if (filterChapters === '11-50' && (chCount < 11 || chCount > 50)) return false;
            if (filterChapters === '51-200' && (chCount < 51 || chCount > 200)) return false;
            if (filterChapters === '201+' && chCount <= 200) return false;
          }
          return true;
        });

        // Endless generation fallback
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
        setCatalogHasMore(apiResults.length > 0 || newOffset < 500);
      }
    } catch (e) {
      console.error("Manga Catalog fetch error", e);
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (!isMangaMode) return;
    fetchMangaCatalog(true);
  }, [filterType, filterStatus, filterGenre, filterChapters, catalogSort, searchQuery, isMangaMode]);

  const handleLoadMoreManga = useCallback(() => {
    if (catalogLoading || !catalogHasMore || !isMangaMode) return;
    fetchMangaCatalog(false);
  }, [catalogLoading, catalogHasMore, catalogOffset, isMangaMode]);

  const toggleFavoriteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    if (favorites.includes(id)) {
      updated = favorites.filter(item => item !== id);
    } else {
      updated = [...favorites, id];
    }
    setFavorites(updated);
    localStorage.setItem('kami_manga_favorites', JSON.stringify(updated));
  };

  // --- GENERAL SEARCH ROUTE LOGIC ---
  const handleSortChange = (sort: string) => {
    setCurrentSort(sort);
    setSearchParams(prev => {
        prev.set('sort', sort);
        return prev;
    });
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const clearFilters = () => {
    setSelectedGenres([]);
    setSelectedStatus('All');
    setSearchQuery('');
    setCurrentSort('popularity');
  };

  const genres = Object.keys(GENRE_MAP).sort((a, b) => a.localeCompare(b, 'ru'));
  const statusOptions = [
    { value: 'All', label: 'Все' },
    { value: 'ongoing', label: 'Онгоинг' },
    { value: 'released', label: 'Завершен' },
    { value: 'anons', label: 'Анонс' },
  ];

  const sortOptions = [
    { value: 'popularity', label: 'Популярные' },
    { value: 'rating', label: 'По рейтингу' },
    { value: 'new', label: 'Новинки' },
    { value: 'random', label: 'Случайные' },
  ];

  // Infinite Scroll Trigger
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          if (isMangaMode && catalogHasMore && !catalogLoading) {
            handleLoadMoreManga();
          } else if (!isMangaMode && hasMore && !isLoadingMore) {
            handleLoadMoreAnime();
          }
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoadingMore, handleLoadMoreAnime, catalogHasMore, catalogLoading, handleLoadMoreManga, isMangaMode]);

  // RENDER INTERFACE SELECTOR
  if (isMangaMode) {
    // --- MANGA CATALOG SCREEN ---
    return (
      <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16 py-8 space-y-8 min-h-screen bg-[#121316] text-[#a5a7b1]">
        <SEO 
          title="Каталог Манги Онлайн на русском - KamiManga" 
          description="Тщательно подобранная библиотека японской манги, корейских вебтунов и маньхуа только на русском языке. Продвинутые фильтры и жанры."
        />

        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-4 border-b border-white/5">
            <div>
              <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
                <span className="w-2 h-10 bg-[#8B5CF6] rounded-full inline-block" />
                Каталог Манги
              </h1>
              <p className="text-xs text-[#7d8291] font-bold uppercase tracking-wider mt-1.5">
                Используйте фильтры для тонкой сортировки по жанрам, странам и актуальным статусам на русском языке.
              </p>
            </div>

            <button 
              onClick={() => {
                setFilterType('all');
                setFilterStatus('all');
                setFilterGenre('all');
                setFilterChapters('all');
                setCatalogSort('followedCount');
                setSearchQuery('');
              }}
              className="text-[10px] font-black text-[#8B5CF6] uppercase tracking-wider hover:opacity-80 transition-opacity border border-[#8B5CF6]/30 px-3.5 py-2 rounded-xl bg-[#8B5CF6]/5 cursor-pointer"
            >
              Сбросить фильтры
            </button>
          </div>

          {/* Filter Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 bg-[#18191d] rounded-3xl p-5 border border-white/5 shadow-xl">
            {/* Search Input */}
            <div className="space-y-1.5 md:col-span-1">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Поиск названия</span>
              <div className="relative group">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#8B5CF6]" />
                <input
                  type="text"
                  placeholder="Название..."
                  className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 pl-9 pr-3 focus:outline-none focus:border-[#8B5CF6] transition-colors"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Format filter */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Тип произведения</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 px-3 focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer"
              >
                <option value="all">Все форматы</option>
                <option value="manga">Манга (Япония)</option>
                <option value="manhwa">Манхва (Корея)</option>
                <option value="manhua">Маньхуа (Китай)</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Статус релиза</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 px-3 focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer"
              >
                <option value="all">Все статусы</option>
                <option value="ongoing">Онгоинг (Выпуск)</option>
                <option value="completed">Завершен полностью</option>
              </select>
            </div>

            {/* Genre filter */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Тематика и Жанры</span>
              <select
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 px-3 focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer"
              >
                <option value="all">Любой жанр</option>
                {allUniqueGenres.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            {/* Chapters amount filter */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Количество глав</span>
              <select
                value={filterChapters}
                onChange={(e) => setFilterChapters(e.target.value)}
                className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 px-3 focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer"
              >
                <option value="all">Любое кол-во</option>
                <option value="1-10">1 – 10 глав</option>
                <option value="11-50">11 – 50 глав</option>
                <option value="51-200">51 – 200 глав</option>
                <option value="201+">201+ глав</option>
              </select>
            </div>

            {/* Sorting criteria */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-[#7d8291] tracking-wider block">Сортировка списка</span>
              <select
                value={catalogSort}
                onChange={(e) => setCatalogSort(e.target.value)}
                className="w-full bg-[#121316] border border-white/5 text-xs font-bold text-white rounded-xl py-2 px-3 focus:outline-none focus:border-[#8B5CF6] transition-colors cursor-pointer"
              >
                <option value="followedCount">По популярности</option>
                <option value="rating">По рейтингу</option>
                <option value="createdAt">По новизне добавления</option>
              </select>
            </div>
          </div>
        </div>

        {/* Catalog Grid Area */}
        <div className="space-y-12">
          {catalogLoading && catalogMangas.length === 0 ? (
            <div className="flex justify-center items-center py-48">
              <Loader2 className="w-12 h-12 text-[#8B5CF6] animate-spin" />
            </div>
          ) : (
            <>
              {catalogMangas.length === 0 ? (
                <div className="py-24 text-center text-slate-500 uppercase font-black text-xs tracking-widest border border-white/5 border-dashed rounded-[2rem] bg-[#18191d]">
                  По заданным параметрам ничего не найдено
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-8 5xl:grid-cols-10 gap-6">
                  {catalogMangas.map((m, idx) => {
                    const isFaved = favorites.includes(m.id);
                    return (
                      <div 
                        key={`catmanga-${m.id}-${idx}`}
                        onClick={() => navigate(`/?mangaId=${m.id}`)}
                        className="group bg-[#18191d] border border-white/5 rounded-2xl overflow-hidden hover:border-[#8B5CF6]/40 transition-all duration-300 flex flex-col justify-between cursor-pointer shadow-lg hover:shadow-2xl"
                      >
                        <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/40">
                          <img 
                            src={m.cover} 
                            alt={m.title} 
                            onError={(e) => { e.currentTarget.src = FALLBACK_COVER; }}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                          {/* Hearts bookmark toggle indicator */}
                          <button 
                            onClick={(e) => toggleFavoriteItem(m.id, e)}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-[#8B5CF6] text-white hover:text-black transition-all z-20"
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFaved ? 'fill-current text-[#8B5CF6]' : ''}`} />
                          </button>

                          {/* Floating indicators of status */}
                          <span className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 text-[8px] font-black text-[#8B5CF6] uppercase rounded">
                            {m.status}
                          </span>

                          {/* Average rate */}
                          <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/50 backdrop-blur-sm rounded text-[8.5px] text-white font-bold flex items-center gap-0.5 border border-white/5">
                            <Star className="w-2.5 h-2.5 fill-current text-yellow-500" /> {m.rating}
                          </div>
                        </div>

                        <div className="p-3.5 space-y-1.5 flex-grow flex flex-col justify-between h-20 bg-[#18191d]">
                          <h4 className="font-extrabold text-[8.5px] text-[#8B5CF6] uppercase tracking-widest truncate">
                            {m.originalTitle || "MANGA INDEX"}
                          </h4>
                          <h3 className="font-black text-xs text-white group-hover:text-[#8B5CF6] transition-colors leading-snug line-clamp-1">
                            {m.title}
                          </h3>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Infinite Scroll trigger point */}
              <div ref={observerTarget} className="mt-16 flex justify-center py-8">
                {catalogLoading && <Loader2 className="w-8 h-8 text-[#8B5CF6] animate-spin" />}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- ANIME CATALOG RENDER ---
  return (
    <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16 py-8 space-y-8 min-h-screen">
      <SEO 
        title="Каталог аниме смотреть онлайн бесплатно - KamiAnime" 
        description="Огромная база аниме: поиск по жанрам, годам и популярности. Смотреть аниме онлайн бесплатно в хорошем качестве. Найдите, что посмотреть сегодня."
      />
      
      {/* Immersive Cinematic Category Header */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 pb-2 border-b border-white/5">
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight font-display flex items-center gap-3">
              <span className="w-2 h-10 bg-primary rounded-full inline-block" />
              Каталог релизов
            </h1>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1.5">
              Свободно исследуйте и фильтруйте тысячи тайтлов из нашей базы
            </p>
          </div>

          {/* Quick status tabs inside header for true premium feel */}
          <div className="flex bg-white/5 border border-white/10 p-1.5 rounded-xl gap-1 select-none w-fit">
            {statusOptions.map(o => (
              <button
                key={o.value}
                onClick={() => setSelectedStatus(o.value)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${selectedStatus === o.value ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Premium Filters Control Bar */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-surface/40 border border-white/5 p-4 rounded-2xl backdrop-blur-xs font-sans">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px] md:max-w-md group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-primary transition-colors font-sans" />
              <input 
                type="text" 
                aria-label="Поиск аниме"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Найти то самое аниме..." 
                className="w-full h-11 bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 text-xs text-white placeholder-slate-500 outline-none focus:border-primary transition-all font-medium"
              />
            </div>

            {/* Genres Toggler button */}
            <button 
              onClick={() => setShowGenreFilters(!showGenreFilters)}
              className={`h-11 px-5 border rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${showGenreFilters || selectedGenres.length > 0 ? 'bg-primary/10 border-primary text-primary' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Жанры</span>
              {selectedGenres.length > 0 && (
                <span className="w-5 h-5 bg-primary text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {selectedGenres.length}
                </span>
              )}
            </button>

            {/* Clear Filters */}
            {(selectedGenres.length > 0 || selectedStatus !== 'All' || searchQuery !== '') && (
              <button 
                onClick={clearFilters}
                className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-primary transition-colors h-11 px-4 rounded-xl border border-dashed border-white/10 hover:border-primary/20 flex items-center justify-center cursor-pointer"
              >
                Очистить фильтры
              </button>
            )}
          </div>

          {/* Sort selection dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Сортировка:</span>
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl gap-1">
              {sortOptions.map(o => (
                <button
                  key={o.value}
                  onClick={() => handleSortChange(o.value)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-extrabold uppercase tracking-wide transition-all cursor-pointer ${currentSort === o.value ? 'bg-white text-black font-black' : 'text-slate-400 hover:text-white'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Expanding Genres Section (Netflix category style selection bar) */}
        {showGenreFilters && (
          <div className="bg-surface/30 border border-white/5 p-6 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-4">Выберите жанры аниме:</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
              {genres.map(genre => {
                const isSelected = selectedGenres.includes(genre);
                return (
                  <button 
                    key={genre} 
                    onClick={() => toggleGenre(genre)}
                    className={`px-3 py-2.5 rounded-xl text-[10px] font-bold border transition-all text-left flex items-center justify-between cursor-pointer ${isSelected ? 'bg-primary border-primary text-white shadow-lg font-bold' : 'bg-white/5 border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
                  >
                    <span className="truncate">{genre}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-white ml-2 animate-in fade-in" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main Grid display area */}
      <div className="space-y-12">
        {isLoading ? (
          <div className="flex justify-center items-center py-48">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {animeList.length === 0 ? (
              <div className="bg-surface/30 rounded-[2rem] py-24 text-center border border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-xl font-black text-white uppercase mb-2">Фильтр пуст</h3>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider max-w-md mx-auto">
                  Тайтлов, подходящих под данные критерии, не найдено. Нажмите очистить фильтры выше.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 3xl:grid-cols-7 4xl:grid-cols-8 5xl:grid-cols-10 gap-x-6 gap-y-10">
                {animeList.map((anime, idx) => (
                  <div key={`${anime.id}-${idx}`} className="animate-in fade-in duration-300">
                    <AnimeCard anime={anime} />
                  </div>
                ))}
              </div>
            )}

            {hasMore && animeList.length > 0 && (
              <div ref={observerTarget} className="mt-16 flex justify-center py-8 animate-pulse">
                {isLoadingMore && <Loader2 className="w-8 h-8 text-primary animate-spin" />}
              </div>
            )}
            
            {/* Elegant SEO Text panel */}
            {!isLoading && animeList.length > 0 && (
              <div className="p-8 bg-surface/20 border border-white/5 rounded-3xl text-slate-400 text-xs md:text-sm leading-relaxed max-w-5xl">
                <h3 className="text-base font-black text-white uppercase tracking-tight mb-3">
                  Смотреть аниме {selectedGenres.length > 0 ? `в жанре ${selectedGenres.join(', ')} ` : ''}онлайн
                </h3>
                <p className="mb-3">
                  Добро пожаловать в крупнейший каталог аниме на KamiAnime. Здесь вы можете найти и смотреть онлайн лучшие тайтлы {selectedGenres.length > 0 ? `в жанре ${selectedGenres.join(', ')}` : 'всех жанров и направлений'}. Наша база постоянно обновляется, предлагая вам как классические шедевры, так и самые горячие новинки сезона.
                </p>
                <p>
                  Мы предоставляем удобный плеер, высокое качество видео (HD 1080p) и выбор из множества вариантов озвучки (Anilibria, Kodik, StudioBand и другие), а также оригинальную дорожку с русскими субтитрами. Используйте фильтры по жанрам, годам и статусу выхода, чтобы быстро найти идеальное аниме на вечер. Приятного просмотра!
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Catalog;
