import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Loader2, Sparkles, Check } from 'lucide-react';
import { Anime, Vote4KSeason } from '../types';
import { fetchAnimes } from '../services/shikimori';
import { Vote4KService } from '../services/vote4k';
import { useAuth } from '../context/AuthContext';
import { Image } from './Image';

interface Suggest4KModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updatedState: Vote4KSeason) => void;
}

const Suggest4KModal: React.FC<Suggest4KModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { user, openAuthModal } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setErrorMessage(null);
      setSuccessMsg(null);
      return;
    }

    // Lock body scroll when modal is open
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isOpen]);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      setErrorMessage(null);
      try {
        const results = await fetchAnimes({ search: searchQuery.trim(), limit: 8 });
        setSearchResults(results || []);
      } catch (err: any) {
        console.error('Anime search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleSelectAndSuggest = async (anime: Anime) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMsg(null);

    try {
      const res = await Vote4KService.suggestAnime({
        animeId: String(anime.id),
        title: anime.title || anime.russianTitle || anime.russian || 'Аниме',
        originalName: anime.originalName || anime.title,
        image: anime.image || anime.cover || '',
        year: anime.year,
        genres: anime.genres || [],
        userEmail: user.email,
        userName: user.name || user.email.split('@')[0],
        userAvatar: user.avatar
      });

      if (res.success) {
        setSuccessMsg(res.message);
        onSuccess(res.state);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setErrorMessage(res.message);
      }
    } catch (err: any) {
      console.error('Suggest error:', err);
      setErrorMessage(err.message || 'Произошла ошибка при отправке');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div 
        className="relative w-full max-w-xl bg-[#141518] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10 animate-in zoom-in-95 duration-200 select-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-gradient-to-r from-[#8B5CF6]/15 via-[#8B5CF6]/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6] shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Предложить аниме на 4K</h3>
              <p className="text-xs text-slate-400">Найдите любимый тайтл для участия в голосовании</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="p-5 border-b border-white/5 bg-black/30">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Введите название аниме (на русском или английском)..."
              className="w-full pl-10 pr-10 py-3 bg-[#0d0e11] border border-white/10 rounded-xl text-sm font-medium text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] transition-all"
              autoFocus
            />
            {isSearching && (
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin" />
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-semibold">
              {errorMessage}
            </div>
          )}

          {successMsg && (
            <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2">
              <Check className="w-4 h-4" /> {successMsg}
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {searchResults.length > 0 ? (
            searchResults.map((anime) => (
              <div
                key={anime.id}
                className="group flex items-center justify-between gap-4 p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 hover:border-[#8B5CF6]/30 transition-all duration-200"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="relative w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-neutral-900 border border-white/10">
                    <Image
                      src={anime.image || anime.cover}
                      alt={anime.title}
                      animeId={anime.id}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-white group-hover:text-[#8B5CF6] transition-colors truncate">
                      {anime.title}
                    </h4>
                    <p className="text-xs text-slate-400 truncate">
                      {anime.originalName || (anime.genres && anime.genres.slice(0, 2).join(', '))}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {anime.year && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-bold">
                          {anime.year}
                        </span>
                      )}
                      {anime.rating && Number(anime.rating) > 0 && (
                        <span className="text-[10px] text-amber-400 font-bold">
                          ★ {Number(anime.rating).toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAndSuggest(anime);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-[#8B5CF6]/20 transition-all hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Предложить
                    </>
                  )}
                </button>
              </div>
            ))
          ) : searchQuery.trim() && !isSearching ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm font-bold text-slate-400 mb-1">Ничего не найдено</p>
              <p className="text-xs">Попробуйте изменить поисковый запрос</p>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 space-y-2">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 flex items-center justify-center text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-300">Начните вводить название</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Каждый пользователь может предложить тайтл и голосовать за предложения других.
              </p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-white/5 bg-black/40 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Правила: Топ-5 тайтлов по итогам 2 дней выйдут в финальное голосование</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default Suggest4KModal;
