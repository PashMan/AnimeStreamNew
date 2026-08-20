
import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet, useNavigate } from 'react-router-dom';
import { Menu, X, Search, MessageSquareText, Shuffle, Crown, ChevronDown, Bookmark, BookOpen, Gamepad2, Home, Compass } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import AuthModal from './AuthModal';
import { fetchAnimes, fetchAnimeDetails } from '../services/shikimori';
import { FALLBACK_IMAGE } from '../constants';
import { AIChatBot } from './AIChatBot';
import { PremiumModal } from './PremiumModal';

import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';

// Helper to find a random anime with a player
const findRandomAnimeWithPlayer = async (): Promise<string | null> => {
  // Shikimori has around 1000+ popular TV animes. Let's pick a random page.
  const randomPage = Math.floor(Math.random() * 50) + 1;
  try {
    const animes = await fetchAnimes({ 
      limit: 20, 
      order: 'popularity',
      kind: 'tv',
      status: 'released',
      score: 7,
      page: randomPage
    }, true, 10); // Bypass queue and high priority for user-triggered random anime
    
    if (animes && animes.length > 0) {
      const randomIndex = Math.floor(Math.random() * animes.length);
      return animes[randomIndex].id;
    }
  } catch (e) {
    console.error(e);
  }
  return null;
};

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const isMangaMode = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('manga.') || 
    localStorage.getItem('kami_manga_mode') === 'true'
  );

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      <div className={`w-9 h-9 bg-gradient-to-tr from-primary to-accent shadow-primary/20 rounded-lg flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform duration-300`}>
        {isMangaMode ? (
          <BookOpen className="w-5 h-5 text-white" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-white"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
        )}
      </div>
      <div className="font-display text-[20px] font-black tracking-tighter text-white leading-none uppercase">
        {isMangaMode ? (
          <>
            KAMI<span className="text-primary font-black">MANGA</span>
          </>
        ) : (
          <>
            KAMI<span className="text-primary font-black">ANIME</span>
          </>
        )}
      </div>
    </div>
  );
};

const Layout: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const { user, logout, openAuthModal } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const isMangaMode = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('manga.') || 
    localStorage.getItem('kami_manga_mode') === 'true'
  );
  
  // Crunchyroll Watchlist
  const [watchlist, setWatchlist] = useState<any[]>([]);

  // Manga Bookmarks for Ribbon
  const [mangaBookmarks, setMangaBookmarks] = useState<any[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kami_manga_bookmarks');
      const cached = localStorage.getItem('kami_manga_meta_cache');
      if (saved) {
        const parsedSaved = JSON.parse(saved);
        const parsedCached = cached ? JSON.parse(cached) : {};
        const list = Object.entries(parsedSaved).map(([id, cat]) => {
          const meta = parsedCached[id] || {};
          return {
            id,
            category: cat,
            title: meta.title || "Тайтл из закладок",
            cover: meta.cover || "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop",
            rating: meta.rating || 9.1
          };
        });
        setMangaBookmarks(list);
      } else {
        setMangaBookmarks([]);
      }
    } catch (e) {
      console.error(e);
      setMangaBookmarks([]);
    }
  }, [pathname, isMangaMode]);
  const [showWatchlistDropdown, setShowWatchlistDropdown] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (user?.email) {
      db.getFavorites(user.email).then(async (ids) => {
        if (!ids || ids.length === 0) {
          if (isMounted) setWatchlist([]);
          return;
        }
        try {
          const promises = ids.slice(0, 5).map(id => fetchAnimeDetails(id.toString()));
          const results = await Promise.all(promises);
          if (isMounted) {
            setWatchlist(results.filter(a => a !== null));
          }
        } catch (e) {
          console.error("Layout watchlist error", e);
        }
      });
    } else {
      setWatchlist([]);
    }
    return () => { isMounted = false; };
  }, [user?.email, pathname]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 45) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isActive = (path: string) => pathname === path;

  const { fetchSlugBlocks } = useSlugBlocks();
  const { dmcaBlocks, setDmcaBlocks } = useDmcaBlocks();

  useEffect(() => {
    fetchSlugBlocks();
    db.getDmcaBlocks().then(setDmcaBlocks).catch(console.error);
  }, [fetchSlugBlocks, setDmcaBlocks]);

  useEffect(() => {
    if (user?.email) {
      const updatePresence = async () => {
        if (document.visibilityState === 'visible') {
          await db.updateLastSeen(user.email);
        }
      };

      updatePresence();

      const interval = setInterval(() => {
        updatePresence();
      }, 60000); // Check every 60s
      
      return () => {
        clearInterval(interval);
      };
    }
  }, [user?.email]);

  useEffect(() => {
    setIsMenuOpen(false);
    setShowSuggestions(false);
  }, [pathname]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchQuery.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        if (isMangaMode) {
          const res = await fetch(`/api/manga/search?q=${encodeURIComponent(searchQuery)}&limit=5`);
          if (res.ok) {
            const data = await res.json();
            const mapped = (data.results || []).map((m: any) => ({
              id: m.id,
              title: m.title,
              image: m.cover,
              isManga: true,
              originalTitle: m.originalTitle || '',
              rating: m.rating || 9.2
            }));
            setSuggestions(mapped);
          }
        } else {
          const results = await fetchAnimes({ search: searchQuery, limit: 5 });
          setSuggestions(results);
        }
      } catch (error) {
        console.error("Error fetching suggestions:", error);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchQuery, isMangaMode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      if (isMangaMode) {
        navigate(`/?q=${encodeURIComponent(searchQuery)}`);
      } else {
        navigate(`/catalog?q=${encodeURIComponent(searchQuery)}`);
      }
      setIsMenuOpen(false);
      setShowSuggestions(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${isMangaMode ? 'bg-[#121316] text-[#a5a7b1]' : 'bg-dark text-slate-200'} font-sans ${isMangaMode ? 'selection:bg-[#8B5CF6]/30 selection:text-white' : 'selection:bg-primary/30'}`}>
      {(import.meta as any).env?.VITE_ENV === 'staging' && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-black text-[10px] font-black uppercase tracking-widest text-center py-1 z-[100]">
          Staging Environment (Тестовый сервер)
        </div>
      )}
      <AuthModal />
      
      <header className={`fixed w-full z-50 transition-all duration-400 ${(import.meta as any).env?.VITE_ENV === 'staging' ? 'top-6' : 'top-0'} ${scrolled ? 'bg-[#141519]/95 backdrop-blur-2xl border-b border-white/5 shadow-2.5xl' : 'bg-[#141519]/80 border-b border-white/5 backdrop-blur-md'}`}>
        <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-8 lg:px-12 3xl:px-16">
          <div className="flex items-center justify-between h-20 gap-6">
            <Link to="/" aria-label="KamiAnime Home" className="hover:opacity-90 transition-opacity shrink-0">
              <Logo />
            </Link>

            <div className="flex-1 hidden md:flex items-center justify-center max-w-xl gap-3 shrink">
              <form onSubmit={handleSearch} className="relative w-full group">
                <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none ${isMangaMode ? 'group-focus-within:text-[#8B5CF6]' : 'group-focus-within:text-primary'} transition-colors`} />
                <input
                  type="text"
                  aria-label={isMangaMode ? "Поиск манги" : "Поиск аниме"}
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder={isMangaMode ? "Поиск по манге..." : "Быстрый поиск..."}
                  className={`w-full h-11 pl-11 pr-4 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:bg-white/10 ${isMangaMode ? 'focus:border-[#8B5CF6]/50' : 'focus:border-primary/50'} focus:outline-none transition-all duration-300`}
                />
                
                {/* Search Suggestions */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0f] border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-3 py-2">Результаты поиска ({isMangaMode ? 'Манга' : 'Аниме'})</div>
                      {suggestions.map((item) => {
                        if (item.isManga) {
                          return (
                            <Link
                              key={item.id}
                              to={`/?mangaId=${item.id}`}
                              className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors group/item"
                              onClick={() => setShowSuggestions(false)}
                            >
                              <img 
                                src={item.image} 
                                alt={item.title} 
                                loading="lazy"
                                onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                                className="w-9 h-12 object-cover rounded shadow-sm group-hover/item:scale-105 transition-transform" 
                                referrerPolicy="no-referrer"
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-200 group-hover/item:text-[#8B5CF6] transition-colors truncate">{item.title}</span>
                                <div className="flex items-center gap-2 text-[9px] font-extrabold uppercase text-slate-500 tracking-wider">
                                  <span className="text-[#8B5CF6]">МАНГА</span>
                                  <span className="w-0.5 h-0.5 rounded-full bg-slate-600"></span>
                                  <span className="flex items-center gap-0.5 text-yellow-500"><Crown className="w-2.5 h-2.5" /> {item.rating}</span>
                                </div>
                              </div>
                            </Link>
                          );
                        } else {
                          const isDmcaBlocked = dmcaBlocks.includes(item.id.toString());
                          return (
                            <Link
                              key={item.id}
                              to={isDmcaBlocked ? `/anime/${item.id}-watch` : `/anime/${item.id}`}
                              className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors group/item"
                              onClick={() => setShowSuggestions(false)}
                            >
                              <img 
                                src={item.image} 
                                alt={item.title} 
                                loading="lazy"
                                onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
                                className="w-9 h-12 object-cover rounded shadow-sm group-hover/item:scale-105 transition-transform" 
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-200 group-hover/item:text-primary transition-colors truncate">{item.title}</span>
                                <div className="flex items-center gap-2 text-[9px] font-extrabold uppercase text-slate-500 tracking-wider">
                                  <span>
                                    {item.type === 'TV Series' ? 'TV' : 
                                     item.type === 'Movie' ? 'Фильм' : 
                                     item.type === 'Special' ? 'Спешл' : 
                                     item.type === 'Music' ? 'Клип' : 
                                     item.type}
                                  </span>
                                  <span className="w-0.5 h-0.5 rounded-full bg-slate-600"></span>
                                  <span className="flex items-center gap-0.5 text-yellow-500"><Crown className="w-2.5 h-2.5" /> {item.rating}</span>
                                </div>
                              </div>
                            </Link>
                          );
                        }
                      })}
                    </div>
                  </div>
                )}
              </form>
              <button aria-label="Random anime"
                onClick={async () => {
                  const id = await findRandomAnimeWithPlayer();
                  if (id) navigate(`/anime/${id}`);
                }}
                className={`p-2.5 bg-white/5 hover:bg-primary hover:text-white rounded-xl transition-all group shrink-0 ${isMangaMode ? 'hover:bg-[#8B5CF6] hover:text-black' : ''}`}
                title="Случайное аниме"
              >
                <Shuffle className="w-4 h-4 group-hover:rotate-12 transition-transform" />
              </button>
            </div>

            {isMangaMode ? (
              <nav className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400 relative">
                <Link to="/" className={`${isActive('/') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all`}>Главная</Link>
                <Link to="/catalog" className={`${isActive('/catalog') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all`}>Каталог</Link>
                {user?.role === 'admin' && (
                  <Link to="/games" className={`${isActive('/games') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all flex items-center gap-1`}><Gamepad2 className="w-3.5 h-3.5" /> Игры</Link>
                )}
                <Link to="/news" className={`${isActive('/news') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all`}>Новости</Link>
                <Link to="/forum" className={`${isActive('/forum') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all`}>Форум</Link>
                <Link to="/community" className={`${isActive('/community') ? 'text-[#8B5CF6]' : 'hover:text-white'} transition-all`}>Сообщество</Link>
                
                {user?.role === 'admin' && (
                  <Link to="/admin" className={`${isActive('/admin') ? 'text-red-500' : 'text-red-400 hover:text-red-300'} transition-all`}>Админ</Link>
                )}

                {/* Minimalist Switch */}
                <div className="flex items-center gap-2 text-[10px] font-bold select-none border-l border-white/10 pl-5">
                  <button
                    onClick={() => {
                      if (window.location.hostname.includes('kamianime.club')) {
                        window.location.href = 'https://kamianime.club/';
                      } else {
                        localStorage.removeItem('kami_manga_mode');
                        window.location.reload();
                      }
                    }}
                    className="text-slate-500 hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
                    title="Переключить на Аниме"
                  >
                    Аниме
                  </button>
                  <span className="text-white/20 select-none">/</span>
                  <span className="text-[#8B5CF6] font-black uppercase tracking-wider relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-[#8B5CF6]">Манга</span>
                </div>
              </nav>
            ) : (
              <nav className="hidden lg:flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400 relative">
                <Link to="/" className={`${isActive('/') ? 'text-primary' : 'hover:text-white'} transition-all`}>Главная</Link>
                
                {/* Browse Dropdown */}
                <div 
                  className="relative group py-2"
                  onMouseEnter={() => setIsCatalogOpen(true)}
                  onMouseLeave={() => setIsCatalogOpen(false)}
                >
                  <Link 
                    to="/catalog"
                    className={`flex items-center gap-1.5 ${isActive('/catalog') ? 'text-primary' : 'hover:text-white'} transition-all font-black uppercase`}
                  >
                    Каталог <ChevronDown className="w-3.5 h-3.5 transition-transform group-hover:rotate-180" />
                  </Link>
                  {isCatalogOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#141519]/95 border border-white/10 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150 z-50">
                      <div className="space-y-3">
                        <Link to="/catalog" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-primary transition-colors">Все Аниме</Link>
                        <Link to="/catalog?sort=popularity" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-primary transition-colors">Популярные</Link>
                        <Link to="/catalog?sort=new" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-primary transition-colors">Новинки Сезона</Link>
                        <Link to="/catalog?status=ongoing" className="block text-[10px] font-black uppercase tracking-wider text-slate-300 hover:text-primary transition-colors">Онгоинги</Link>
                        <div className="h-px bg-white/5 my-2" />
                        <div className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest mb-1">Рекомендуемые жанры</div>
                        <Link to="/catalog?genre=Экшен" className="block text-[9px] font-bold text-slate-400 hover:text-white transition-colors">Экшен</Link>
                        <Link to="/catalog?genre=Комедия" className="block text-[9px] font-bold text-slate-400 hover:text-white transition-colors">Комедия</Link>
                        <Link to="/catalog?genre=Фэнтези" className="block text-[9px] font-bold text-slate-400 hover:text-white transition-colors">Фэнтези</Link>
                      </div>
                    </div>
                  )}
                </div>

                {user?.role === 'admin' && (
                  <Link to="/games" className={`${isActive('/games') ? 'text-primary' : 'hover:text-white'} transition-all flex items-center gap-1`}><Gamepad2 className="w-3.5 h-3.5" /> Игры</Link>
                )}
                <Link to="/news" className={`${isActive('/news') ? 'text-primary' : 'hover:text-white'} transition-all`}>Новости</Link>
                <Link to="/forum" className={`${isActive('/forum') ? 'text-primary' : 'hover:text-white'} transition-all`}>Форум</Link>
                <Link to="/community" className={`${isActive('/community') ? 'text-primary' : 'hover:text-white'} transition-all`}>Сообщество</Link>
                
                {user?.role === 'admin' && (
                  <Link to="/admin" className={`${isActive('/admin') ? 'text-red-500' : 'text-red-400 hover:text-red-300'} transition-all`}>Админ</Link>
                )}

                {/* Minimalist Switch */}
                <div className="flex items-center gap-2 text-[10px] font-bold select-none border-l border-white/10 pl-5">
                  <span className="text-primary font-black uppercase tracking-wider relative after:absolute after:bottom-[-4px] after:left-0 after:right-0 after:h-[2px] after:bg-primary">Аниме</span>
                  <span className="text-white/20 select-none">/</span>
                  <button
                    onClick={() => {
                      if (window.location.hostname.includes('kamianime.club')) {
                        window.location.href = 'https://manga.kamianime.club/';
                      } else {
                        localStorage.setItem('kami_manga_mode', 'true');
                        window.location.reload();
                      }
                    }}
                    className="text-slate-500 hover:text-white transition-colors cursor-pointer uppercase tracking-wider"
                    title="Переключить на Мангу"
                  >
                    Манга
                  </button>
                </div>
              </nav>
            )}

            <div className="flex items-center gap-3 sm:gap-4 shrink-0 relative">
              {/* Watchlist Ribbon Hover Popover */}
              {user && (
                <div 
                  className="relative"
                  onMouseEnter={() => setShowWatchlistDropdown(true)}
                  onMouseLeave={() => setShowWatchlistDropdown(false)}
                >
                  <button 
                    aria-label={isMangaMode ? "Мои Закладки" : "Моя лента"} 
                    className={`p-2.5 bg-white/5 hover:bg-primary hover:text-white rounded-xl transition-all relative text-slate-300 ${isMangaMode ? 'hover:bg-[#8B5CF6]/20 hover:text-[#8B5CF6]' : ''}`}
                  >
                    <Bookmark className="w-4.5 h-4.5" />
                    {!isMangaMode && watchlist.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#141519]">
                        {watchlist.length}
                      </span>
                    )}
                    {isMangaMode && mangaBookmarks.length > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#8B5CF6] text-black text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#141519]">
                        {mangaBookmarks.length}
                      </span>
                    )}
                  </button>

                  {showWatchlistDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-80 bg-[#1c1d21] border border-white/10 rounded-2xl p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 duration-150 relative">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          {isMangaMode ? "Закладки (Манга)" : "Моя лента (Очередь)"}
                        </span>
                        <Link to="/profile" className={`text-[9px] font-black uppercase hover:underline ${isMangaMode ? 'text-[#8B5CF6]' : 'text-primary'}`}>Все</Link>
                      </div>
  
                      {isMangaMode ? (
                        mangaBookmarks.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-500">
                            У вас пока нет закладок манги. Нажмите на сердечко в каталоге или выберите категорию закладок.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {mangaBookmarks.map((m) => (
                              <Link 
                                key={m.id} 
                                to={`/?mangaId=${m.id}`}
                                className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors group/watchlist-item"
                              >
                                <img src={m.cover} alt={m.title} className="w-9 h-12 object-cover rounded shadow-md shrink-0 border border-white/10" referrerPolicy="no-referrer" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-black text-white truncate group-hover/watchlist-item:text-[#8B5CF6] transition-colors">{m.title}</div>
                                  <div className="text-[9px] text-slate-500 font-extrabold uppercase mt-0.5">Лист: <span className="text-[#8B5CF6]">{m.category}</span></div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )
                      ) : (
                        watchlist.length === 0 ? (
                          <div className="py-6 text-center text-xs text-slate-500">
                            Ваша очередь пуста. Добавьте аниме в закладки на страницах деталей.
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                            {watchlist.map((anime) => (
                              <Link 
                                key={anime.id} 
                                to={`/anime/${anime.id}`}
                                className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors group/watchlist-item"
                              >
                                <img src={anime.image} alt={anime.title} className="w-9 h-12 object-cover rounded shadow-md shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-black text-white truncate group-hover/watchlist-item:text-primary transition-colors">{anime.title}</div>
                                  <div className="text-[9px] text-slate-500 font-extrabold uppercase">{anime.type || 'TV'} • {anime.episodes || '?'} эп</div>
                                </div>
                              </Link>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
 
              {/* VIP Link Button */}
              <Link
                to="/premium"
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-md ${
                  user?.isPremium
                    ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/30 shadow-amber-500/10'
                    : 'bg-gradient-to-r from-[#8B5CF6]/20 to-primary/20 text-[#A78BFA] border border-[#8B5CF6]/40 hover:bg-[#8B5CF6]/30 shadow-[#8B5CF6]/15 hover:scale-105'
                }`}
                title="Премиум подписка Kami VIP"
              >
                <Crown className={`w-3.5 h-3.5 ${user?.isPremium ? 'text-yellow-400 fill-current' : 'text-[#8B5CF6]'}`} />
                <span>{user?.isPremium ? 'VIP Активен' : 'VIP 1 мес 0₽'}</span>
              </Link>

              {user && (
                <Link aria-label="Messages" to="/messages" title="Сообщения" className="p-2.5 bg-white/5 hover:bg-primary hover:text-white rounded-xl transition-all relative text-slate-300">
                   <MessageSquareText className="w-4.5 h-4.5" />
                </Link>
              )}
              {user ? (
                <div className="flex items-center gap-3">
                  <Link to="/profile" className="w-9 h-9 rounded-xl overflow-hidden ring-2 ring-primary/20 hover:ring-primary transition-all">
                    <img src={user.avatar} loading="lazy" alt="User" className="w-full h-full object-cover" />
                  </Link>
                  <button onClick={logout} className="text-[9px] font-black uppercase text-slate-500 hover:text-red-400 transition-colors tracking-widest hidden sm:block">Выйти</button>
                </div>
              ) : (
                <button onClick={openAuthModal} className="h-10 px-6 bg-primary hover:bg-accent text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/15 hover:scale-102 active:scale-95">
                  Войти
                </button>
              )}
              <button aria-label="Toggle menu" className="md:hidden text-white" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                {isMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm md:hidden" onClick={() => setIsMenuOpen(false)} />
      )}

      {/* Mobile Side Drawer */}
      <div className={`fixed top-0 right-0 bottom-0 w-[75%] max-w-[320px] bg-surface border-l border-white/10 z-[70] transform transition-transform duration-300 ease-out md:hidden flex flex-col ${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">Меню</span>
          <button aria-label="Close menu" onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6 text-white" />
          </button>
        </div>
        
        <div className="px-6 py-4">
          <form onSubmit={handleSearch} className="relative w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              aria-label="Поиск аниме"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Найти аниме..."
              className="w-full h-12 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-slate-500 focus:bg-white focus:text-slate-900 focus:outline-none transition-all duration-500 shadow-inner"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-2">
                  {suggestions.map((anime) => {
                    const isDmcaBlocked = dmcaBlocks.includes(anime.id.toString());
                    return (
                    <Link
                      key={anime.id}
                      to={isDmcaBlocked ? `/anime/${anime.id}-watch` : `/anime/${anime.id}`}
                      className="flex items-center gap-4 p-2 hover:bg-white/5 rounded-xl transition-colors group/item"
                      onClick={() => { setShowSuggestions(false); setIsMenuOpen(false); }}
                    >
                      <img src={anime.image} alt={anime.title} className="w-10 h-14 object-cover rounded-lg" />
                      <span className="text-sm font-bold text-slate-200 truncate">{anime.title}</span>
                    </Link>
                  )})}
                </div>
              </div>
            )}
          </form>
        </div>
        
        <nav className="flex-grow overflow-y-auto p-6 flex flex-col gap-2">
          {/* Mobile Selector Toggle */}
          <div className="flex items-center justify-between text-xs font-bold select-none border-b border-white/5 pb-4 mb-4">
            <span className="text-slate-500 uppercase tracking-wider text-[10px]">Режим:</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const isKami = window.location.hostname.includes('kamianime.club');
                  if (isMangaMode) {
                    if (isKami) {
                      window.location.href = 'https://kamianime.club/';
                    } else {
                      localStorage.removeItem('kami_manga_mode');
                      window.location.reload();
                    }
                  }
                }}
                className={`text-[10px] uppercase tracking-wider transition-colors pt-0.5 ${!isMangaMode ? 'text-primary font-black scale-105' : 'text-slate-500 hover:text-white'}`}
              >
                Аниме
              </button>
              <span className="text-white/10">/</span>
              <button
                onClick={() => {
                  const isKami = window.location.hostname.includes('kamianime.club');
                  if (!isMangaMode) {
                    if (isKami) {
                      window.location.href = 'https://manga.kamianime.club/';
                    } else {
                      localStorage.setItem('kami_manga_mode', 'true');
                      window.location.reload();
                    }
                  }
                }}
                className={`text-[10px] uppercase tracking-wider transition-colors pt-0.5 ${isMangaMode ? 'text-[#8B5CF6] font-black scale-105' : 'text-slate-500 hover:text-white'}`}
              >
                Манга
              </button>
            </div>
          </div>

          {isMangaMode ? (
            <>
              <Link to="/" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Главная
              </Link>
              <Link to="/catalog" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/catalog') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Каталог
              </Link>
              {user?.role === 'admin' && (
                <Link to="/games" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/games') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                  Игры
                </Link>
              )}
              <Link to="/news" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/news') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Новости
              </Link>
              <Link to="/forum" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/forum') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Форум
              </Link>
              <Link to="/community" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/community') ? 'bg-[#8B5CF6] text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Сообщество
              </Link>
              <Link 
                to="/premium" 
                onClick={() => setIsMenuOpen(false)}
                className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors flex items-center justify-between bg-gradient-to-r from-[#8B5CF6]/20 to-amber-500/20 border border-[#8B5CF6]/30 ${isActive('/premium') ? 'text-white' : 'text-yellow-300'}`}
              >
                <span className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                  <span>Kami VIP</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-200">
                  {user?.isPremium ? 'Активен' : '1 мес 0 ₽'}
                </span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Главная
              </Link>
              
              <Link 
                to="/catalog"
                onClick={() => setIsMenuOpen(false)}
                className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors flex items-center justify-between ${isActive('/catalog') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}
              >
                Каталог
              </Link>

              {user?.role === 'admin' && (
                <Link to="/games" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/games') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                  Игры
                </Link>
              )}

              <Link to="/news" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/news') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Новости
              </Link>
              
              <Link to="/forum" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/forum') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Форум
              </Link>

              <Link to="/community" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/community') ? 'bg-primary text-white' : 'text-slate-300 hover:bg-white/5'}`}>
                Сообщество
              </Link>

              <Link 
                to="/premium" 
                onClick={() => setIsMenuOpen(false)}
                className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors flex items-center justify-between bg-gradient-to-r from-[#8B5CF6]/20 to-amber-500/20 border border-[#8B5CF6]/30 ${isActive('/premium') ? 'text-white' : 'text-yellow-300'}`}
              >
                <span className="flex items-center gap-2">
                  <Crown className="w-4 h-4 text-yellow-400 fill-current" />
                  <span>Kami VIP</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-200">
                  {user?.isPremium ? 'Активен' : '1 мес 0 ₽'}
                </span>
              </Link>
            </>
          )}
          
          {user?.role === 'admin' && (
            <Link to="/admin" className={`p-4 rounded-xl font-black uppercase tracking-widest text-sm transition-colors ${isActive('/admin') ? 'bg-red-500 text-white' : 'text-red-400 hover:bg-white/5'}`}>
              Админ-панель
            </Link>
          )}
        </nav>

        <div className="p-6 border-t border-white/5 bg-black/20">
          {user ? (
            <div className="flex flex-col gap-4">
              <Link to="/profile" className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">
                <img src={user.avatar} loading="lazy" className="w-10 h-10 rounded-lg object-cover" alt="" />
                <div>
                  <div className="font-bold text-white text-sm">{user.name}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Профиль</div>
                </div>
              </Link>
              <button 
                onClick={() => { logout(); setIsMenuOpen(false); }} 
                className="w-full py-3 bg-red-500/10 text-red-500 font-black uppercase tracking-widest text-xs rounded-xl hover:bg-red-500 hover:text-white transition-all"
              >
                Выйти
              </button>
            </div>
          ) : (
            <button 
              onClick={() => { openAuthModal(); setIsMenuOpen(false); }} 
              className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              Войти в аккаунт
            </button>
          )}
        </div>
      </div>

      <main className={`flex-grow ${(import.meta as any).env?.VITE_ENV === 'staging' ? 'pt-28' : 'pt-20'} pb-16 md:pb-0`}>
        <Outlet />
      </main>

      <footer className="bg-surface/50 border-t border-white/5 pt-24 pb-12 mt-auto">
        <div className="max-w-[1600px] 3xl:max-w-[2000px] 4xl:max-w-[2500px] 5xl:max-w-[3200px] mx-auto px-4 sm:px-6 lg:px-8 3xl:px-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-20">
            <div className="col-span-2">
              <div className="mb-8">
                <Logo />
              </div>
              <p className="text-slate-400 max-w-md leading-relaxed text-sm font-medium">
                {isMangaMode ? (
                  "Премиальный сервис для чтения манги на русском языке. Быстрый свитковый ридер, удобный каталог, личные закладки и оценки глав в одном интерфейсе."
                ) : (
                  "Премиальный сервис для просмотра аниме в лучшем качестве. Мы объединяем лучшие студии озвучки и перевода в одном удобном интерфейсе."
                )}
              </p>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 font-display">Навигация</h4>
              <ul className="space-y-4 text-[13px] font-bold">
                <li><Link to={isMangaMode ? "/" : "/catalog"} className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>{isMangaMode ? "Каталог манги" : "Весь каталог"}</Link></li>
                <li><Link to="/news" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Новости</Link></li>
                <li><Link to="/forum" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Форум</Link></li>
                <li><Link to="/community" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Сообщество</Link></li>
                <li><Link to="/profile" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Личный кабинет</Link></li>
                <li>
                  <a href="https://t.me/kamianimeclub" target="_blank" rel="noopener noreferrer" className={`transition-colors flex items-center gap-2 text-blue-400 ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    Telegram
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 font-display">Поддержка</h4>
              <ul className="space-y-4 text-[13px] font-bold">
                <li><Link to="/dmca" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>DMCA</Link></li>
                <li><Link to="/faq" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Помощь</Link></li>
                <li><Link to="/contact" className={`transition-colors ${isMangaMode ? 'hover:text-[#8B5CF6]' : 'hover:text-primary'}`}>Контакты</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-10 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6 text-xs font-black uppercase tracking-widest text-slate-500">
            <p>© {new Date().getFullYear()} {isMangaMode ? "KamiManga" : "KamiAnime"} Project. Все права защищены.</p>
            <div className="flex flex-wrap gap-6 sm:gap-10 items-center">
              <Link to="/terms" className="hover:text-white transition-colors">Правила</Link>
              <Link to="/privacy" className="hover:text-white transition-colors">Конфиденциальность</Link>
            </div>
          </div>
        </div>
      </footer>
      <AIChatBot />

      {/* Mobile Bottom Tab Bar (MangaLib style) */}
      <div className={`fixed bottom-0 left-0 right-0 h-16 border-t z-50 md:hidden flex items-center justify-around px-2 backdrop-blur-xl transition-all duration-300 ${
        isMangaMode ? 'bg-[#141519]/95 border-white/5 shadow-2xl' : 'bg-dark/95 border-white/5 shadow-2xl'
      }`}>
        {/* Tab 1: Главная */}
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center gap-1 w-14 h-full transition-colors ${
            pathname === '/' 
              ? (isMangaMode ? 'text-[#8B5CF6]' : 'text-primary') 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Главная</span>
        </Link>

        {/* Tab 2: Каталог */}
        <Link 
          to="/catalog" 
          className={`flex flex-col items-center justify-center gap-1 w-14 h-full transition-colors ${
            pathname === '/catalog' 
              ? (isMangaMode ? 'text-[#8B5CF6]' : 'text-primary') 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Каталог</span>
        </Link>

        {/* Tab 3: Закладки */}
        <button 
          onClick={() => {
            if (!user) {
              openAuthModal();
            } else {
              navigate('/profile');
            }
          }}
          className={`flex flex-col items-center justify-center gap-1 w-14 h-full transition-colors cursor-pointer ${
            pathname === '/profile' 
              ? (isMangaMode ? 'text-[#8B5CF6]' : 'text-primary') 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div className="relative">
            <Bookmark className="w-5 h-5" />
            {isMangaMode && mangaBookmarks.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#8B5CF6] text-black text-[8px] font-black rounded-full flex items-center justify-center border border-[#141519]">
                {mangaBookmarks.length}
              </span>
            )}
            {!isMangaMode && watchlist.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary text-white text-[8px] font-black rounded-full flex items-center justify-center border border-[#141519]">
                {watchlist.length}
              </span>
            )}
          </div>
          <span className="text-[9px] font-black uppercase tracking-wider">Закладки</span>
        </button>

        {/* Tab 4: Форум */}
        <Link 
          to="/forum" 
          className={`flex flex-col items-center justify-center gap-1 w-14 h-full transition-colors ${
            pathname.startsWith('/forum') 
              ? (isMangaMode ? 'text-[#8B5CF6]' : 'text-primary') 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquareText className="w-5 h-5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Форум</span>
        </Link>

        {/* Tab 5: Меню */}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex flex-col items-center justify-center gap-1 w-14 h-full transition-colors cursor-pointer ${
            isMenuOpen 
              ? (isMangaMode ? 'text-[#8B5CF6]' : 'text-primary') 
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {isMenuOpen ? <X className="w-5 h-5 text-red-500" /> : <Menu className="w-5 h-5" />}
          <span className="text-[9px] font-black uppercase tracking-wider">{isMenuOpen ? 'Закрыть' : 'Меню'}</span>
        </button>
      </div>

      {/* Global Premium Modal instance */}
      <PremiumModal />
    </div>
  );
};

export default Layout;