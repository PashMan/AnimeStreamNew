import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Sparkles, Loader2, CheckCircle2, AlertCircle, Film, Crown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Vote4KService } from '../services/vote4k';
import { fetchAnimes } from '../services/shikimori';
import { Anime, Vote4KSeason } from '../types';

interface Suggest4KModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updatedState: Vote4KSeason) => void;
}

export const Suggest4KModal: React.FC<Suggest4KModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { user, isVip, openAuthModal, openPremiumModal } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Anime[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<Anime | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const searchTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setResults([]);
      setSelectedAnime(null);
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetchAnimes({ search: searchQuery.trim(), limit: 12 });
        setResults(res.slice(0, 12));
      } catch (err) {
        console.error('Anime search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  if (!isOpen) return null;

  const handleSelect = (anime: Anime) => {
    setSelectedAnime(anime);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    if (!selectedAnime) {
      setError('Выберите аниме из списка');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await Vote4KService.suggestAnime({
        animeId: String(selectedAnime.id),
        title: selectedAnime.title || selectedAnime.russian || (selectedAnime as any).name || '',
        originalName: selectedAnime.originalName || (selectedAnime as any).name || (selectedAnime as any).japanese || '',
        image: selectedAnime.image || (selectedAnime as any).poster || '',
        year: selectedAnime.year || (selectedAnime as any).airedOn || '',
        genres: selectedAnime.genres || [],
        userEmail: user.email,
        userName: user.name || user.email.split('@')[0],
        userAvatar: user.avatar
      });

      if (response.success) {
        setSuccessMsg(response.message || 'Тайтл успешно предложен на 4K ремастеринг!');
        if (onSuccess && response.state) {
          onSuccess(response.state);
        }
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(response.message || 'Не удалось предложить тайтл');
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при отправке');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#14151a] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl relative text-white animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-display font-black tracking-tight flex items-center gap-2">
              <span>Предложить аниме в 4K</span>
              {isVip && (
                <span className="px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40 text-[10px] font-black uppercase flex items-center gap-1">
                  <Crown className="w-3 h-3 text-[#8B5CF6]" /> x2 Голос
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400">
              Предложите любимый тайтл для добавления в ультра-высоком качестве 4K
            </p>
          </div>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative mb-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Введите название аниме (например: Атака титанов)..."
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] text-white text-sm placeholder:text-slate-500 outline-none transition-all"
            autoFocus
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-[#8B5CF6] animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
          )}
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 min-h-[220px] max-h-[340px]">
          {selectedAnime && (
            <div className="p-3 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/40 flex items-center gap-3 mb-2">
              <img
                src={selectedAnime.image || (selectedAnime as any).poster}
                alt={selectedAnime.title}
                className="w-12 h-16 object-cover rounded-lg shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono font-bold text-[#A78BFA] uppercase">Выбранный тайтл:</div>
                <div className="text-sm font-bold text-white truncate">{selectedAnime.title || selectedAnime.russian}</div>
                <div className="text-xs text-slate-400 truncate">{selectedAnime.originalName || (selectedAnime as any).name || ''}</div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-[#8B5CF6] shrink-0" />
            </div>
          )}

          {results.length > 0 ? (
            results.map((anime) => {
              const isSelected = selectedAnime?.id === anime.id;
              return (
                <button
                  key={anime.id}
                  onClick={() => handleSelect(anime)}
                  className={`w-full p-2.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer text-left ${
                    isSelected
                      ? 'bg-[#8B5CF6]/20 border-[#8B5CF6]'
                      : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <img
                    src={anime.image || (anime as any).poster}
                    alt={anime.title}
                    className="w-10 h-14 object-cover rounded-lg shrink-0 bg-slate-800"
                    loading="lazy"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {anime.title || anime.russian || (anime as any).name}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {anime.originalName || (anime as any).name || ''} {anime.year ? `(${anime.year})` : ''}
                    </div>
                    {anime.genres && anime.genres.length > 0 && (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {anime.genres.slice(0, 3).join(', ')}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          ) : searchQuery.trim().length >= 2 && !isSearching ? (
            <div className="py-12 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
              <Film className="w-8 h-8 opacity-40" />
              <span>Ничего не найдено по запросу "{searchQuery}"</span>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-xs">
              Начните вводить название, чтобы выбрать аниме для голосования в 4K
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-4 mt-2 border-t border-white/10 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
          >
            Отмена
          </button>

          <button
            onClick={handleSubmit}
            disabled={!selectedAnime || isSubmitting}
            className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-[#8B5CF6]/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Отправка...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Предложить в 4K</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Suggest4KModal;
