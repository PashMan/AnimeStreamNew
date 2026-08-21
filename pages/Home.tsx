import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ChevronLeft, PlayCircle, Calendar, Megaphone, Clock, Crown, ChevronDown, MessageSquare, Plus, MonitorPlay, Heart, Flame, TrendingUp, Newspaper, Layers, BookOpen } from 'lucide-react';
import { Image } from '../components/Image';
import AnimeCard from '../components/AnimeCard';
import SEO from '../components/SEO';
import { LazySection } from '../components/LazySection';
import { LazyRender } from '../components/LazyRender';
import { fetchAnimes, fetchCalendar, fetchNews, fetchAnimeDetails } from '../services/shikimori';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';
import { Anime, ScheduleItem, NewsItem, ForumTopic, CommunityCollection } from '../types';
import { FALLBACK_IMAGE, COLLECTIONS_DATA } from '../constants';
import CollectionCard from '../components/CollectionCard';
import CreateCollectionModal from '../components/CreateCollectionModal';
import { KodikRecentUpdate, fetchRecentUpdates } from '../services/kodik';

function formatKodikTime(dateStr: string): string {
  if (!dateStr) return "Только что";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Только что";
    if (diffMins < 60) {
      if (diffMins === 1) return "1 минуту назад";
      if (diffMins % 10 === 1 && diffMins !== 11) return `${diffMins} минуту назад`;
      if (diffMins % 10 >= 2 && diffMins % 10 <= 4 && (diffMins < 10 || diffMins > 20)) return `${diffMins} минуты назад`;
      return `${diffMins} минут назад`;
    }
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      if (diffHours === 1) return "1 час назад";
      if (diffHours % 10 === 1 && diffHours !== 11) return `${diffHours} час назад`;
      if (diffHours % 10 >= 2 && diffHours % 10 <= 4 && (diffHours < 10 || diffHours > 20)) return `${diffHours} часа назад`;
      return `${diffHours} часов назад`;
    }
    
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `Вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return "Сегодня";
  }
}

const Home: React.FC = () => {
  const ongoingRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLDivElement>(null);
  const trendingRef = useRef<HTMLDivElement>(null);
  const favoritesRef = useRef<HTMLDivElement>(null);
  const { user, openAuthModal, isVip, openPremiumModal } = useAuth();
  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  
  const [heroAnimes, setHeroAnimes] = useState<Anime[]>([]);
  const [newAnimes, setNewAnimes] = useState<Anime[]>([]);
  const [kodikRecentUpdates, setKodikRecentUpdates] = useState<KodikRecentUpdate[]>([]);
  const [trendingAnimes, setTrendingAnimes] = useState<Anime[]>([]);
  const [animes4k, setAnimes4k] = useState<Anime[]>([]);
  const [favoritesAnimes, setFavoritesAnimes] = useState<Anime[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [communityCollections, setCommunityCollections] = useState<CommunityCollection[]>([]);
  const [collectionType, setCollectionType] = useState<'official' | 'community'>('official');
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [isHeroLoading, setIsHeroLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const anime4kRef = useRef<HTMLDivElement>(null);

  const currentDayName = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date().getDay()];

  useEffect(() => {
    if (collectionType === 'community') {
      setIsLoadingCollections(true);
      db.getCommunityCollections().then(data => {
        setCommunityCollections(data);
        setIsLoadingCollections(false);
      });
    }
  }, [collectionType]);

  // Hero Data Load (Immediate)
  useEffect(() => {
    let isMounted = true;
    
    const loadHero = async () => {
        if (heroAnimes.length === 0) setIsHeroLoading(true);
        const data = await fetchAnimes({ order: 'popularity', status: 'ongoing', limit: 15 }, true);
        if (!isMounted) return;
        
        if (data && data.length > 0) {
            const filteredData = data.filter(anime => {
                const maxEpisodes = Math.max(anime.episodes || 0, anime.episodesAired || 0);
                return maxEpisodes === 0 || maxEpisodes <= 36;
            }).slice(0, 5);
            setHeroAnimes(filteredData);
            setIsHeroLoading(false);
            
            await Promise.all(filteredData.map(async (anime) => {
                try {
                    const details = await fetchAnimeDetails(anime.id);
                    if (details && isMounted) {
                        setHeroAnimes(prev => {
                            const next = [...prev];
                            const index = next.findIndex(a => a.id === anime.id);
                            if (index !== -1) {
                                next[index] = { ...next[index], ...details };
                            }
                            return next;
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to enrich hero item ${anime.id}`, e);
                }
            }));
        } else {
            setIsHeroLoading(false);
        }
    };

    loadHero();
    
    // Load recently updated episodes from Kodik
    fetchRecentUpdates(40).then(data => {
        if (isMounted) {
            setKodikRecentUpdates(data);
        }
    });
    
    // Immediate load for first sections
    fetchAnimes({ order: 'ranked', status: 'ongoing', limit: 40 }).then(data => {
        if (isMounted) {
            setNewAnimes(data.filter(anime => {
                const maxEpisodes = Math.max(anime.episodes || 0, anime.episodesAired || 0);
                return maxEpisodes === 0 || maxEpisodes <= 36;
            }).slice(0, 20));
        }
    });
    fetchAnimes({ order: 'popularity', limit: 20 }).then(data => {
        if (isMounted) {
            setTrendingAnimes(data);
        }
    });

    // Fetch 4K Animes
    db.getAnime4k().then(async (ids) => {
      try {
        const promises = ids.map(id => fetchAnimeDetails(id));
        const results = await Promise.all(promises);
        if (isMounted) {
          setAnimes4k(results.filter(a => a !== null) as Anime[]);
        }
      } catch (e) {
        console.error('Failed to fetch 4K animes', e);
      }
    });
    
    return () => { isMounted = false; };
  }, []);

  // Fetch logged-in user's favorites list for customized Netflix rows
  useEffect(() => {
    let isMounted = true;
    if (user?.email) {
      setIsLoadingFavorites(true);
      db.getFavorites(user.email).then(async (ids) => {
        if (!isMounted) return;
        if (ids && ids.length > 0) {
          try {
            const promises = ids.slice(0, 12).map(id => fetchAnimeDetails(id));
            const results = await Promise.all(promises);
            if (isMounted) {
              setFavoritesAnimes(results.filter(a => a !== null) as Anime[]);
            }
          } catch (e) {
            console.error("Failed to fetch favorites details on Home:", e);
          } finally {
            if (isMounted) setIsLoadingFavorites(false);
          }
        } else {
          if (isMounted) {
            setFavoritesAnimes([]);
            setIsLoadingFavorites(false);
          }
        }
      }).catch(err => {
        console.error("Error loading user favorites on Home:", err);
        if (isMounted) setIsLoadingFavorites(false);
      });
    } else {
      setFavoritesAnimes([]);
      setIsLoadingFavorites(false);
    }
    return () => { isMounted = false; };
  }, [user?.email]);

  useEffect(() => {
    if (heroAnimes.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex(prev => (prev + 1) % heroAnimes.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [heroAnimes.length]);

  const currentHero = heroAnimes[heroIndex];
  const heroRating = currentHero ? (typeof currentHero.rating === 'number' ? currentHero.rating : parseFloat((currentHero.rating as any) || '0')) : 0;

  const scrollContainer = (ref: React.RefObject<HTMLDivElement>, direction: 'left' | 'right') => {
    if (ref.current) {
      const scrollAmount = 600;
      ref.current.scrollBy({ left: direction === 'right' ? scrollAmount : -scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-16 pb-24 bg-[#141519]">
      <SEO 
        title="Смотреть аниме онлайн бесплатно в хорошем качестве - KamiAnime" 
        description="Смотрите аниме онлайн бесплатно в хорошем качестве. Новинки сезона, популярные тайтлы, удобный плеер и активное сообщество."
      />
      
      {/* Immersive Cinematic Hero Slider */}
      {isHeroLoading && heroAnimes.length === 0 ? (
        <section className="relative h-[75vh] min-h-[520px] md:h-[85vh] md:min-h-[620px] w-full overflow-hidden bg-black/80 animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-t from-[#141519] via-[#141519]/60 to-transparent z-10" />
          <div className="relative max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 h-full flex items-end pb-16 z-20">
            <div className="max-w-3xl space-y-6 w-full">
              <div className="w-24 h-6 bg-white/5 rounded-lg"></div>
              <div className="w-3/4 h-16 md:h-24 bg-white/5 rounded-2xl"></div>
              <div className="w-full h-20 bg-white/5 rounded-xl"></div>
              <div className="w-40 h-14 bg-white/5 rounded-2xl mt-4"></div>
            </div>
          </div>
        </section>
      ) : currentHero ? (
        <section className="relative h-[75vh] min-h-[600px] md:h-[85vh] md:min-h-[720px] w-full overflow-hidden group select-none">
          {heroAnimes.map((anime, idx) => (
            <div key={anime.id} className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${idx === heroIndex && loadedImages[anime.id] ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}>
              <Image 
                src={anime.cover || anime.image} 
                alt={anime.title} 
                animeId={anime.id}
                animeTitle={anime.originalName || anime.title}
                priority={idx === 0}
                onImageLoad={() => setLoadedImages(prev => ({...prev, [anime.id]: true}))}
                className="w-full h-full object-cover transition-transform duration-[15s] ease-linear scale-100 group-hover:scale-105" 
              />
              {/* Premium Netflix Gradient Masks for supreme contrast and legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#141519] via-[#141519]/50 to-transparent z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#141519]/95 via-[#141519]/70 md:via-[#141519]/20 to-transparent z-10" />
            </div>
          ))}

          {/* Side navigation arrows */}
          <button 
            onClick={() => setHeroIndex(prev => (prev - 1 + heroAnimes.length) % heroAnimes.length)} 
            className="absolute left-8 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-primary border border-white/5 rounded-full text-white/80 hover:text-white transition-all z-30 opacity-0 group-hover:opacity-100 hidden md:flex items-center justify-center backdrop-blur-md shadow-2xl hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Предыдущий слайд"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setHeroIndex(prev => (prev + 1) % heroAnimes.length)} 
            className="absolute right-8 top-1/2 -translate-y-1/2 p-3 bg-black/40 hover:bg-primary border border-white/5 rounded-full text-white/80 hover:text-white transition-all z-30 opacity-0 group-hover:opacity-100 hidden md:flex items-center justify-center backdrop-blur-md shadow-2xl hover:scale-110 active:scale-95 cursor-pointer"
            aria-label="Следующий слайд"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          <input type="hidden" id="hero-slider" value={heroIndex} />
          <div className="relative max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16 h-full flex flex-col justify-end pb-10 md:pb-16 pt-24 z-20">
            <div className="max-w-3xl 3xl:max-w-4xl space-y-3.5 md:space-y-5 animate-in fade-in slide-in-from-bottom-8 duration-700">
              
              {/* Meta tags / Badges row */}
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 my-2">
                <span className="px-2.5 py-1 bg-primary text-white text-[10px] sm:text-xs font-black uppercase tracking-widest rounded shadow-lg shadow-primary/25 shrink-0">Онгоинг</span>
                <span className="px-2.5 py-1 bg-primary/10 border border-primary/25 text-primary text-[10px] sm:text-xs font-black uppercase rounded backdrop-blur-md shrink-0">Субтитры | Озвучка</span>
                {heroRating > 0 && (
                  <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] sm:text-xs font-extrabold uppercase rounded backdrop-blur-md shrink-0">
                     Рейтинг ★ {heroRating.toFixed(1)}
                  </span>
                )}
                {currentHero.studio && (
                  <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider rounded backdrop-blur-md shrink-0">
                    Студия: {currentHero.studio}
                  </span>
                )}
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] sm:text-xs font-semibold rounded backdrop-blur-md shrink-0">
                  {currentHero.year || '2024'}
                </span>
                <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-slate-300 text-[10px] sm:text-xs font-semibold rounded backdrop-blur-md shrink-0">
                  {currentHero.episodes || '?'} серий
                </span>
              </div>

              {/* Title with sleek shadows */}
              <h1 className="text-2xl sm:text-4xl md:text-6xl 3xl:text-7xl font-display font-black text-white hover:text-primary transition-all duration-300 tracking-tight leading-[0.95] line-clamp-2 uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                {currentHero.title}
              </h1>

              {/* Sub-meta (Genres) */}
              <div className="text-[11px] 3xl:text-xs font-bold text-slate-400 flex items-center flex-wrap gap-1.5 h-5 min-h-[20px]">
                {currentHero.genres && currentHero.genres.length > 0 ? (
                  currentHero.genres.slice(0, 4).map((g, ind) => (
                    <span key={g} className="flex items-center gap-1.5">
                      <span className="hover:text-white transition-colors">{g}</span>
                      {ind < Math.min(currentHero.genres.length, 4) - 1 && (
                        <span className="w-1 h-1 rounded-full bg-slate-600 block" />
                      )}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 font-medium">Загрузка жанров...</span>
                )}
              </div>

              {/* Decription */}
              <p className="text-slate-200 text-xs md:text-sm 3xl:text-base line-clamp-2 md:line-clamp-3 leading-relaxed max-w-2xl 3xl:max-w-3xl font-medium drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)] md:pe-12">
                {currentHero.description || "Описание загружается..."}
              </p>

              {/* Buttons Row with premium interactive states */}
              <div className="flex flex-wrap gap-4 sm:gap-6 items-center pt-3">
                <Link 
                  to={dmcaBlocks.includes(currentHero.id.toString()) ? `/anime/${currentHero.id}-watch` : `/anime/${currentHero.id}${currentHero.slug && !slugBlocks.includes(currentHero.id.toString()) ? `-${currentHero.slug}` : ''}`} 
                  className="px-6 py-3.5 sm:px-8 sm:py-4 bg-primary hover:bg-primary/95 text-white font-black rounded-xl flex items-center gap-2.5 shrink-0 uppercase text-xs sm:text-sm tracking-widest shadow-2xl shadow-primary/25 transition-all hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                >
                  <PlayCircle className="w-5 h-5 fill-current shrink-0" /> Смотреть
                </Link>

                <Link 
                  to={dmcaBlocks.includes(currentHero.id.toString()) ? `/anime/${currentHero.id}-watch` : `/anime/${currentHero.id}${currentHero.slug && !slugBlocks.includes(currentHero.id.toString()) ? `-${currentHero.slug}` : ''}`} 
                  className="px-6 py-3.5 sm:px-8 sm:py-4 bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/30 text-white font-black rounded-xl flex items-center gap-2.5 shrink-0 uppercase text-xs sm:text-sm tracking-widest transition-all backdrop-blur-md hover:scale-[1.03] active:scale-[0.97] cursor-pointer"
                >
                  Информация
                </Link>

                {/* Micro Slides Controls Container */}
                <div className="flex gap-2 items-center bg-black/40 backdrop-blur-md p-1.5 rounded-lg border border-white/5 ml-auto md:ml-4 select-none">
                  <button 
                    onClick={() => setHeroIndex(prev => (prev - 1 + heroAnimes.length) % heroAnimes.length)}
                    className="p-1 px-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                    aria-label="Предыдущее аниме"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex gap-1.5 items-center">
                    {heroAnimes.map((_, i) => (
                      <button aria-label={`Слайд ${i + 1}`} key={i} onClick={() => setHeroIndex(i)} className={`h-1 rounded transition-all duration-300 ${i === heroIndex ? 'w-6 bg-primary' : 'w-1.5 bg-white/30 hover:bg-white/60'}`} />
                    ))}
                  </div>
                  <button 
                    onClick={() => setHeroIndex(prev => (prev + 1) % heroAnimes.length)}
                    className="p-1 px-1.5 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-all active:scale-90 cursor-pointer"
                    aria-label="Следующее аниме"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="h-[40vh] flex items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-[10px] bg-[#141519]">
          Контент временно недоступен
        </div>
      )}

      {/* Main Containers: Sliding over the darkened bottom hero edge */}
      <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16 space-y-16 3xl:space-y-20 -mt-16 md:-mt-24 pb-20 relative z-30">

        {/* Minimalist Portal Selector */}
        <div className="flex items-center justify-center gap-4 text-xs font-bold py-2 border-b border-white/5 max-w-xs mx-auto mb-10 select-none animate-in fade-in duration-300">
          <span className="text-primary font-black uppercase tracking-widest relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-primary">
            Аниме
          </span>
          <span className="text-white/20">/</span>
          <button
            onClick={() => {
              if (window.location.hostname.includes('kamianime.club')) {
                window.location.href = 'https://manga.kamianime.club/';
              } else {
                localStorage.setItem('kami_manga_mode', 'true');
                window.location.reload();
              }
            }}
            className="text-slate-500 hover:text-white transition-colors cursor-pointer uppercase tracking-widest font-bold"
          >
            Манга
          </button>
        </div>

        {/* My List / Favorites Section (Rendered dynamically for logged-in users) */}
        {user && (favoritesAnimes.length > 0 || isLoadingFavorites) && (
          <section className="relative z-10 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                  <span>Мой список</span>
                </h2>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <div className="flex gap-2">
                  <button aria-label="Scroll left" onClick={() => scrollContainer(favoritesRef, 'left')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/50 hover:text-[#8B5CF6] transition-all cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                  <button aria-label="Scroll right" onClick={() => scrollContainer(favoritesRef, 'right')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/50 hover:text-[#8B5CF6] transition-all cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
            
            <div ref={favoritesRef} className="flex gap-6 overflow-x-auto hide-scrollbar scroll-smooth pb-4 px-1 snap-x min-h-[360px]">
              {isLoadingFavorites ? (
                Array.from({length: 6}).map((_, i) => (
                  <div key={`fav-pulse-${i}`} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start animate-pulse">
                     <div className="w-full aspect-[2/3] bg-white/5 rounded-xl mb-3"></div>
                     <div className="h-4 bg-white/5 rounded w-3/4 mb-2"></div>
                     <div className="h-3 bg-white/5 rounded w-1/2"></div>
                  </div>
                ))
              ) : (
                favoritesAnimes.map((anime, idx) => (
                  <div key={`fav-${anime.id}-${idx}`} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start">
                    <AnimeCard anime={anime} />
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* Widescreen Recently Updated (Свежие серии) Section */}
        <section className="relative z-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-[#8B5CF6] tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                <span>Свежие серии</span>
              </h2>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
               <div className="flex gap-2">
                 <button aria-label="Scroll left" onClick={() => scrollContainer(latestRef, 'left')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-[#8B5CF6] transition-all cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
                 <button aria-label="Scroll right" onClick={() => scrollContainer(latestRef, 'right')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-[#8B5CF6] transition-all cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
          
          <div ref={latestRef} className="flex gap-6 overflow-x-auto hide-scrollbar scroll-smooth pb-4 px-1 snap-x">
            {kodikRecentUpdates.length > 0 ? (
              kodikRecentUpdates.slice(0, 15).map((anime, idx) => {
                const isDmcaBlocked = dmcaBlocks.includes(anime.id.toString());
                const isSlugBlocked = slugBlocks.includes(anime.id.toString());
                const targetUrl = isDmcaBlocked ? `/anime/${anime.id}-watch` : `/anime/${anime.id}${anime.slug && !isSlugBlocked ? `-${anime.slug}` : ''}`;
                const displayTime = formatKodikTime(anime.updatedAt);
                const isPremium = Number(anime.id) % 3 === 0;

                return (
                  <div key={`latest-ep-${anime.id}-${idx}`} className="w-[280px] sm:w-[320px] 3xl:w-[380px] 4xl:w-[440px] flex-none snap-start text-left">
                    <Link to={targetUrl} className="group block relative w-full h-full">
                      {/* Image Frame aspect-video */}
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-3 bg-neutral-900/40 border border-white/5 group-hover:border-[#8B5CF6]/50 transition-all duration-400 ease-out shadow-lg group-hover:shadow-[0_12px_24px_rgba(139,92,246,0.15)]">
                        <Image 
                          src={anime.image} 
                          alt={anime.title} 
                          animeId={anime.id}
                          animeTitle={anime.originalName || anime.title}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" 
                        />
                        {/* Immersive background overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        
                        {/* Widescreen play icon */}
                        <div className="absolute inset-0 bg-[#8B5CF6]/10 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center z-10">
                          <div className="w-12 h-12 bg-[#8B5CF6] text-white rounded-full flex items-center justify-center scale-90 group-hover:scale-100 transition-all duration-300 shadow-[0_0_20px_rgba(139,92,246,0.7)]">
                            <PlayCircle className="w-6 h-6 fill-current ml-0.5" />
                          </div>
                        </div>

                        {/* Premium label or audio track language badge */}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-20">
                          {isPremium && (
                            <span className="bg-[#8B5CF6] text-black text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm flex items-center gap-0.5">
                              <Crown className="w-2.5 h-2.5 fill-current" /> Premium
                            </span>
                          )}
                          <span className="bg-black/60 backdrop-blur-md text-white text-[7.5px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-white/5">
                            Эп. {anime.episode}
                          </span>
                        </div>

                        {/* Duration or Timestamp corner */}
                        <div className="absolute bottom-2.5 right-2.5 z-20 bg-black/70 backdrop-blur-md text-[8px] font-extrabold uppercase tracking-widest text-[#8B5CF6] px-1.5 py-0.5 rounded border border-[#8B5CF6]/10">
                          {displayTime}
                        </div>
                      </div>

                      {/* Details structure below the landscape frame */}
                      <div className="px-0.5">
                        <h3 className="font-bold text-xs sm:text-[13px] 3xl:text-sm text-slate-100 group-hover:text-[#8B5CF6] transition-colors line-clamp-1 leading-snug">
                          {anime.title}
                        </h3>
                        <div className="flex items-center gap-1.5 text-[9px] 3xl:text-[10px] font-extrabold uppercase tracking-tight text-slate-500 mt-1">
                          <span className="text-slate-400 font-bold truncate max-w-[170px]">{anime.translation}</span>
                          <span className="w-0.5 h-0.5 rounded-full bg-slate-700 shrink-0" />
                          <span className="text-[#8B5CF6] font-black shrink-0">Full HD 1080p</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })
            ) : (
              Array.from({length: 4}).map((_, i) => (
                <div key={i} className="w-[280px] sm:w-[320px] 3xl:w-[380px] 4xl:w-[440px] flex-none snap-start animate-pulse">
                  <div className="w-full aspect-video bg-white/5 rounded-xl mb-3"></div>
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-1.5"></div>
                  <div className="h-3 bg-white/5 rounded w-1/2"></div>
                </div>
              ))
            )}
          </div>
        </section>
        
        {/* Ongoing Section */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                <span>Онгоинги</span>
              </h2>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
               <Link to="/catalog?order=ranked&status=ongoing" className="text-[10px] font-black uppercase tracking-widest text-[#8B5CF6] hover:text-white transition-colors flex items-center gap-1.5 mr-3">
                 Смотреть все <ChevronRight className="w-4 h-4" />
               </Link>
               <div className="hidden sm:block w-px h-6 bg-white/10" />
               <div className="flex gap-2">
                 <button aria-label="Scroll left" onClick={() => scrollContainer(ongoingRef, 'left')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-white transition-all"><ChevronLeft className="w-4 h-4" /></button>
                 <button aria-label="Scroll right" onClick={() => scrollContainer(ongoingRef, 'right')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-white transition-all"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
          <div ref={ongoingRef} className="flex gap-6 overflow-x-auto hide-scrollbar scroll-smooth pb-4 px-1 snap-x min-h-[360px]">
            {newAnimes.length > 0 ? newAnimes.map((anime, idx) => (
              <div key={`ongoing-${anime.id}-${idx}`} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start">
                <AnimeCard anime={anime} />
              </div>
            )) : Array.from({length: 6}).map((_, i) => (
              <div key={i} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start animate-pulse">
                  <div className="w-full aspect-[2/3] bg-white/5 rounded-xl mb-3"></div>
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-white/5 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </section>

        {/* 4K Anime Section (Premium Exclusive) */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                <span className="flex items-center gap-2">
                  4K Аниме
                  <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 text-[10px] font-black uppercase flex items-center gap-1">
                    <Crown className="w-3 h-3 text-[#8B5CF6]" /> Premium
                  </span>
                </span>
              </h2>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
               <Link to="/premium" className="text-[10px] font-black uppercase tracking-widest text-[#8B5CF6] hover:text-white transition-colors flex items-center gap-1.5 mr-3">
                 {isVip ? 'Доступно с Premium' : 'Смотреть в 4K'} <ChevronRight className="w-4 h-4" />
               </Link>
               <div className="hidden sm:block w-px h-6 bg-white/10" />
               <div className="flex gap-2">
                 <button aria-label="Scroll left" onClick={() => scrollContainer(anime4kRef, 'left')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-white transition-all"><ChevronLeft className="w-4 h-4" /></button>
                 <button aria-label="Scroll right" onClick={() => scrollContainer(anime4kRef, 'right')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-white transition-all"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
          <div ref={anime4kRef} className="flex gap-6 overflow-x-auto hide-scrollbar scroll-smooth pb-4 px-1 snap-x min-h-[360px]">
            {animes4k.length > 0 ? animes4k.map((anime, idx) => (
              <div key={`4k-${anime.id}-${idx}`} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start relative group">
                <AnimeCard anime={anime} />
                <div className="absolute top-3 right-3 z-20 pointer-events-none">
                  <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-[#8B5CF6]/40 text-[#A78BFA] text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg">
                    <Crown className="w-2.5 h-2.5 text-[#8B5CF6]" /> 4K
                  </span>
                </div>
              </div>
            )) : Array.from({length: 6}).map((_, i) => (
              <div key={i} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start animate-pulse">
                  <div className="w-full aspect-[2/3] bg-white/5 rounded-xl mb-3"></div>
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-white/5 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </section>

        {/* Trending Section */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                <span>В тренде</span>
              </h2>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
               <Link to="/catalog?order=popularity" className="text-[10px] font-black uppercase tracking-widest text-[#8B5CF6] hover:text-white transition-colors flex items-center gap-1.5 mr-3">
                 Смотреть все <ChevronRight className="w-4 h-4" />
               </Link>
               <div className="hidden sm:block w-px h-6 bg-white/10" />
               <div className="flex gap-2">
                 <button aria-label="Scroll left" onClick={() => scrollContainer(trendingRef, 'left')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-[#8B5CF6] transition-all"><ChevronLeft className="w-4 h-4" /></button>
                 <button aria-label="Scroll right" onClick={() => scrollContainer(trendingRef, 'right')} className="p-2.5 rounded-xl bg-[#1c1d21] border border-white/5 hover:border-white/10 hover:bg-white/5 text-white/40 hover:text-[#8B5CF6] transition-all"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
          </div>
          <div ref={trendingRef} className="flex gap-6 overflow-x-auto hide-scrollbar scroll-smooth pb-4 px-1 snap-x min-h-[360px]">
            {trendingAnimes.length > 0 ? trendingAnimes.map((anime, idx) => (
              <div key={`trend-${anime.id}-${idx}`} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start">
                <AnimeCard anime={anime} rank={idx + 1} />
              </div>
            )) : Array.from({length: 6}).map((_, i) => (
              <div key={i} className="w-[180px] sm:w-[220px] 3xl:w-[260px] 4xl:w-[300px] flex-none snap-start animate-pulse">
                  <div className="w-full aspect-[2/3] bg-white/5 rounded-xl mb-3"></div>
                  <div className="h-4 bg-white/5 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-white/5 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </section>

        {/* Schedule Section */}
        <LazySection fetchData={fetchCalendar}>
          {(schedule: ScheduleItem[]) => {
            const activeDayName = expandedDay || currentDayName;
            const activeDayData = schedule.find(d => d.day === activeDayName) || schedule[0] || { day: activeDayName, animes: [] };
            
            return (
              <section className="relative z-20"> 
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                      <span>Расписание серий</span>
                    </h2>
                  </div>
                </div>

                {/* Day Tabs */}
                <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar select-none border-b border-white/5 mb-6">
                  {schedule.map((day) => {
                    const isActive = day.day === activeDayName;
                    const isToday = day.day === currentDayName;
                    return (
                      <button
                        key={day.day}
                        onClick={() => setExpandedDay(day.day)}
                        className={`px-5 py-3 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all border shrink-0 flex items-center gap-2 cursor-pointer ${
                          isActive 
                            ? 'bg-[#8B5CF6] text-white border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/25 scale-[1.02]' 
                            : 'bg-[#1c1d21]/60 border-white/5 hover:border-white/12 text-slate-400 hover:text-white'
                        }`}
                      >
                        {day.day}
                        {isToday && (
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse' : 'bg-[#8B5CF6]'}`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Day List */}
                <div className="grid grid-cols-1 md:grid-cols-2 3xl:grid-cols-3 4xl:grid-cols-4 gap-4 3xl:gap-6">
                  {activeDayData.animes.length > 0 ? activeDayData.animes.map((item, idx) => {
                    const isDmcaBlocked = dmcaBlocks.includes(item.id.toString());
                    const isSlugBlocked = slugBlocks.includes(item.id.toString());
                    const targetUrl = isDmcaBlocked ? `/anime/${item.id}-watch` : `/anime/${item.id}${item.slug && !isSlugBlocked ? `-${item.slug}` : ''}`;
                    
                    return (
                      <Link 
                        key={idx} 
                        to={targetUrl} 
                        className="group flex items-center justify-between gap-4 sm:gap-6 bg-[#1c1d21]/40 hover:bg-[#1c1d21]/80 border border-white/5 hover:border-[#8B5CF6]/30 rounded-xl p-4 transition-all duration-300"
                      >
                        <div className="flex items-center gap-2 text-xs font-extrabold text-[#8B5CF6] bg-[#8B5CF6]/15 border border-[#8B5CF6]/20 px-3 py-2 rounded-lg shrink-0 group-hover:bg-[#8B5CF6] group-hover:text-black transition-all mr-2">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>{item.time}</span>
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <h4 className="text-sm font-bold text-slate-100 group-hover:text-[#8B5CF6] transition-colors line-clamp-1">
                            {item.title}
                          </h4>
                        </div>
                        <div className="text-slate-500 group-hover:text-white transition-all transform group-hover:translate-x-1 duration-300 shrink-0">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </Link>
                    );
                  }) : (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center border border-dashed border-white/5 bg-white/5 rounded-xl">
                      <Calendar className="w-8 h-8 text-slate-600 mb-2.5" />
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Нет запланированных релизов на этот день</p>
                    </div>
                  )}
                </div>
              </section>
            );
          }}
        </LazySection>
        <LazySection fetchData={fetchNews}>
          {(news: NewsItem[]) => (
            <section className="relative z-10">
               <div className="flex items-center justify-between mb-6">
                  <div>
                      <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                        <span>Новости</span>
                      </h2>
                  </div>
                  <Link to="/news" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#8B5CF6] transition-colors flex items-center gap-1">
                      Все новости <ChevronRight className="w-4 h-4" />
                  </Link>
               </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-4 4xl:grid-cols-6 gap-6">
                  {news.slice(0, 6).map((item) => (
                     <div key={item.id} className="group bg-[#1c1d21]/30 border border-white/5 hover:border-[#8B5CF6]/20 rounded-xl overflow-hidden transition-all duration-300 shadow-xl flex flex-col">
                        {item.video ? (
                          <div className="aspect-video w-full bg-black relative">
                             <iframe 
                               src={`https://www.youtube.com/embed/${item.video}`} 
                               className="w-full h-full" 
                               loading="lazy"
                               title={item.title}
                               frameBorder="0" 
                               allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                               allowFullScreen
                             ></iframe>
                          </div>
                        ) : null}
                        <Link to={`/news/${item.id}`} className="p-5 flex-1 flex flex-col justify-between">
                           <div>
                              <div className="flex items-center justify-between mb-3">
                                 <span className="text-[9px] font-black text-[#8B5CF6] uppercase tracking-widest bg-[#8B5CF6]/10 px-2 py-0.5 rounded">
                                   {item.category}
                                 </span>
                                 <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                   {item.date}
                                 </span>
                              </div>
                              <h3 className="text-sm font-bold text-slate-100 group-hover:text-[#8B5CF6] transition-colors mb-2 line-clamp-2 leading-snug">
                                {item.title}
                              </h3>
                              <p className="text-slate-400 text-xs line-clamp-3 leading-relaxed mt-1">
                                {item.summary?.replace(/<[^>]*>?/gm, '').replace(/\[.*?\]/g, '')}
                              </p>
                           </div>
                           <div className="pt-4 flex items-center gap-1 text-[9px] font-black text-[#8B5CF6] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                               Читать далее <ChevronRight className="w-3 h-3" />
                           </div>
                        </Link>
                     </div>
                  ))}
                </div>
            </section>
          )}
        </LazySection>

        {/* Forum Discussions Section */}
        <LazySection fetchData={() => db.getForumTopics(undefined, undefined, 5, 'news')}>
          {(forumTopics: ForumTopic[]) => (
            <section className="relative z-10">
               <div className="flex items-center justify-between mb-6">
                  <div>
                      <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                        <span>Обсуждения</span>
                      </h2>
                  </div>
                  <Link to="/forum" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#8B5CF6] transition-colors flex items-center gap-1">
                      Весь форум <ChevronRight className="w-4 h-4" />
                  </Link>
               </div>

                 <div className="grid gap-3">
                  {forumTopics.slice(0, 4).map(topic => (
                     <Link key={topic.id} to={`/forum/${topic.id}`} className="group bg-[#1c1d21]/30 hover:bg-[#1c1d21]/60 border border-white/5 hover:border-[#8B5CF6]/30 rounded-xl p-5 transition-all duration-300 cursor-pointer shadow-lg flex items-center gap-4">
                       <div className="flex-1 min-w-0 space-y-1.5">
                         <div className="flex items-center gap-3">
                           <span className="px-2 py-0.5 bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/20 rounded text-[9px] font-black uppercase tracking-widest">
                             {topic.category}
                           </span>
                           <span className="text-[10px] font-bold text-slate-500">
                              {topic.author.name}
                           </span>
                           <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {new Date(topic.createdAt).toLocaleDateString('ru-RU')}
                           </span>
                         </div>
                         <h3 className="text-sm font-bold text-white group-hover:text-[#8B5CF6] transition-colors line-clamp-1 leading-snug">
                           {topic.title}
                         </h3>
                         <p className="text-slate-400 text-xs line-clamp-1">{topic.content}</p>
                       </div>
                       
                       <div className="flex items-center gap-4 shrink-0 border-l border-white/5 pl-4">
                          <div className="text-center min-w-[50px]">
                             <div className="text-sm font-black text-white">{topic.repliesCount}</div>
                             <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Ответов</div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                       </div>
                     </Link>
                  ))}
               </div>
            </section>
          )}
        </LazySection>

        {/* Collections Section */}
        <LazyRender threshold={0.1}>
          <section className="mt-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6 sm:gap-8">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                <div>
                  <h2 className="text-xl md:text-2xl font-display font-extrabold text-white tracking-tight flex items-center gap-3 border-l-4 border-primary pl-3">
                    <span>Подборки</span>
                  </h2>
                </div>
                
                <div className="flex bg-surface/80 p-1.5 rounded-xl border border-white/10 self-start sm:self-auto select-none gap-1">
                  <button 
                    onClick={() => setCollectionType('official')}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${collectionType === 'official' ? 'bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/20' : 'text-slate-400 hover:text-white'}`}
                  >
                    Официальные
                  </button>
                  <button 
                    onClick={() => setCollectionType('community')}
                    className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all cursor-pointer ${collectionType === 'community' ? 'bg-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/20' : 'text-slate-400 hover:text-white'}`}
                  >
                    Сообщество
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-4 self-end sm:self-auto shrink-0">
                {collectionType === 'community' && (
                  <button 
                    onClick={() => user ? setIsCreateModalOpen(true) : openAuthModal()}
                    className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-white uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Создать подборку
                  </button>
                )}
                <Link to="/collections" className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-[#8B5CF6] transition-colors flex items-center gap-1">
                  Смотреть все <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {collectionType === 'official' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-6">
                {COLLECTIONS_DATA.slice(0, 6).map((collection) => (
                  <CollectionCard key={collection.id} collection={collection} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 3xl:grid-cols-5 4xl:grid-cols-6 gap-6">
                {isLoadingCollections ? (
                  Array(4).fill(0).map((_, i) => (
                    <div key={i} className="h-48 rounded-2xl bg-white/5 animate-pulse border border-white/5"></div>
                  ))
                ) : communityCollections.length === 0 ? (
                  <div className="col-span-full text-center py-12 flex flex-col items-center justify-center border border-dashed border-white/5 bg-surface/10 rounded-2xl">
                    <Layers className="w-8 h-8 text-slate-600 mb-2.5" />
                    <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Подборок от сообщества пока нет</p>
                  </div>
                ) : (
                  communityCollections.slice(0, 6).map((collection) => {
                    const coverImage = collection.coverImage || collection.items?.[0]?.animeImage;
                    return (
                      <div key={collection.id} className="group relative h-48 rounded-2xl overflow-hidden shadow-xl border border-white/5">
                        {coverImage ? (
                          <img 
                            src={coverImage} 
                            alt={collection.name} 
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 to-black/80"></div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35 opacity-90 group-hover:opacity-100 transition-opacity duration-300"></div>
                        
                        <Link to={`/collections/community/${collection.id}`} className="absolute inset-0 z-10"></Link>
 
                        <div className="absolute inset-0 p-5 flex flex-col justify-end z-20 pointer-events-none">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="bg-[#8B5CF6]/15 backdrop-blur-md px-2 py-0.5 rounded text-[#8B5CF6] text-[9px] font-black uppercase tracking-widest border border-[#8B5CF6]/20">
                              Community
                            </div>
                            <div className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">
                              {collection.items?.length || 0} аниме
                            </div>
                          </div>
                          <h3 className="text-white font-bold text-base leading-tight drop-shadow-lg group-hover:text-[#8B5CF6] transition-colors">{collection.name}</h3>
                          <Link 
                            to={`/profile/${collection.creator?.email}`}
                            className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 truncate hover:text-white transition-colors pointer-events-auto"
                          >
                            от {collection.creator?.name}
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        </LazyRender>
        
        <CreateCollectionModal 
          isOpen={isCreateModalOpen} 
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            db.getCommunityCollections().then(setCommunityCollections);
          }}
        />
      </div>
    </div>
  );
};

export default Home;
