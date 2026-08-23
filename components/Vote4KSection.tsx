import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Trophy, Clock, Plus, ChevronRight, ThumbsUp, Crown, CheckCircle2, Flame, Award, Film, PlayCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Vote4KService } from '../services/vote4k';
import { Vote4KSeason, Vote4KSuggestion, Vote4KFinalCandidate } from '../types';
import Suggest4KModal from './Suggest4KModal';
import { Link } from 'react-router-dom';

function formatCountdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (days > 0) {
    return `${days}д ${hours.toString().padStart(2, '0')}ч ${mins.toString().padStart(2, '0')}м`;
  }
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const Vote4KSection: React.FC = () => {
  const { user, isVip, openAuthModal, openPremiumModal } = useAuth();
  const [season, setSeason] = useState<Vote4KSeason | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [loadingVoteId, setLoadingVoteId] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const data = await Vote4KService.getState();
      if (data) {
        setSeason(data);
        const diff = Math.max(0, data.stageEndTime - Date.now());
        setTimeLeft(diff);
      }
    } catch (e) {
      console.warn('[Vote4KSection] Error loading state:', e);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchState]);

  // Countdown timer ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1000) {
          fetchState();
          return 0;
        }
        return prev - 1000;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchState]);

  const handleUpvote = async (suggestionId: string) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setLoadingVoteId(suggestionId);
    try {
      const res = await Vote4KService.upvoteSuggestion(suggestionId, user.email);
      if (res.state) {
        setSeason(res.state);
      }
    } catch (err) {
      console.error('Upvote error:', err);
    } finally {
      setLoadingVoteId(null);
    }
  };

  const handleVoteFinal = async (candidateId: string) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setLoadingVoteId(candidateId);
    try {
      const res = await Vote4KService.voteFinal(candidateId, user.email);
      if (res.state) {
        setSeason(res.state);
      }
    } catch (err) {
      console.error('Vote final error:', err);
    } finally {
      setLoadingVoteId(null);
    }
  };

  if (!season) return null;

  const stage = season.stage || 'suggestions';
  const totalVotes = stage === 'voting'
    ? (season.finalCandidates || []).reduce((acc, curr) => acc + (curr.votes || 0), 0)
    : (season.suggestions || []).reduce((acc, curr) => acc + (curr.votes || 0), 0);

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#12131a] via-[#161722] to-[#0e0f14] border border-white/10 p-5 sm:p-8 shadow-2xl">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#A78BFA] text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[#8B5CF6]" />
              Сезон #{season.seasonNumber || 1} • 4K Голосование
            </span>
            {isVip && (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase flex items-center gap-1">
                <Crown className="w-3 h-3 text-emerald-400" /> VIP Голос x2
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>Выбери следующее</span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#8B5CF6] to-[#C084FC]">4K Аниме</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Сообщество голосует за любимые тайтлы. Победитель сезона отправляется на добавление в максимальном 4K качестве!
          </p>
        </div>

        {/* Stage & Timer Card */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6]">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {stage === 'suggestions' && 'Сбор заявок до конца:'}
                {stage === 'voting' && 'Финал голосования:'}
                {stage === 'winner' && 'Победитель объявлен:'}
                {stage === 'cooldown' && 'Следующий сезон через:'}
              </div>
              <div className="text-sm sm:text-base font-mono font-black text-white">
                {formatCountdown(timeLeft)}
              </div>
            </div>
          </div>

          {stage === 'suggestions' && (
            <button
              onClick={() => {
                if (!user) {
                  openAuthModal();
                  return;
                }
                setIsSuggestModalOpen(true);
              }}
              className="px-4 sm:px-5 py-3 rounded-2xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-[#8B5CF6]/25 transition-all flex items-center gap-2 cursor-pointer active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Предложить</span>
              <span>Тайтл</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage Tabs */}
      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 my-6">
        {[
          { id: 'suggestions', label: '1. Предложения', desc: 'Сбор тайтлов' },
          { id: 'voting', label: '2. Финал', desc: 'Голосование ТОП' },
          { id: 'winner', label: '3. Победитель', desc: 'Ремастеринг в 4K' },
          { id: 'cooldown', label: '4. Перерыв', desc: 'Подготовка релиза' },
        ].map((tab) => {
          const isActive = stage === tab.id;
          return (
            <div
              key={tab.id}
              className={`p-3 rounded-xl border transition-all ${
                isActive
                  ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/60 text-white shadow-lg shadow-[#8B5CF6]/10'
                  : 'bg-white/[0.02] border-white/5 text-slate-500'
              }`}
            >
              <div className={`text-xs font-bold ${isActive ? 'text-[#A78BFA]' : 'text-slate-400'}`}>
                {tab.label}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                {tab.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* STAGE 1: SUGGESTIONS */}
      {stage === 'suggestions' && (
        <div className="relative z-10 space-y-4">
          {season.suggestions && season.suggestions.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {season.suggestions.map((item, idx) => {
                const isUserVoted = user && item.voters && item.voters.includes(user.email);
                const pct = totalVotes > 0 ? Math.round((item.votes / totalVotes) * 100) : 0;
                const isLoading = loadingVoteId === item.id;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/5 hover:border-white/15 transition-all flex flex-col justify-between group"
                  >
                    <div className="flex gap-3">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-14 h-20 object-cover rounded-xl shrink-0 bg-slate-800 shadow-md"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                          <span className="font-mono text-[#A78BFA]">#{idx + 1}</span>
                          {item.year && <span>• {item.year}</span>}
                        </div>
                        <h4 className="text-sm font-bold text-white truncate group-hover:text-[#A78BFA] transition-colors">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-400 truncate">
                          {item.originalName || ''}
                        </p>
                        <div className="text-[10px] text-slate-500 truncate mt-1">
                          Предложил(а): <span className="text-slate-300 font-medium">{item.suggestedBy?.name || 'Участник'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Vote Bar & Button */}
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span className="text-slate-300 font-mono">{item.votes} {item.votes === 1 ? 'голос' : item.votes < 5 ? 'голоса' : 'голосов'}</span>
                          <span className="text-slate-500 font-mono">{pct}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#8B5CF6] to-[#C084FC] rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(4, pct)}%` }}
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => handleUpvote(item.id)}
                        disabled={isLoading}
                        className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0 ${
                          isUserVoted
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-[#8B5CF6]/20 hover:bg-[#8B5CF6] text-white border border-[#8B5CF6]/40 hover:border-[#8B5CF6]'
                        }`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" />
                        <span>{isUserVoted ? 'Голос учтён' : '+1'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-14 text-center text-slate-400 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3">
              <Film className="w-10 h-10 text-slate-500 opacity-60" />
              <div className="text-base font-bold text-white">Список предложений нового сезона пуст</div>
              <p className="text-xs text-slate-400 max-w-sm">
                Будьте первым! Предложите тайтл, который хотите увидеть в 4K качестве на KamiAnime.
              </p>
              <button
                onClick={() => {
                  if (!user) {
                    openAuthModal();
                    return;
                  }
                  setIsSuggestModalOpen(true);
                }}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-[#8B5CF6]/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Предложить аниме</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* STAGE 2: FINAL VOTING */}
      {stage === 'voting' && (
        <div className="relative z-10 space-y-4">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 mb-4">
            <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-amber-300">Финальное голосование открыто!</h4>
              <p className="text-xs text-slate-300">
                Голосуйте за финалиста. Тайтл с наибольшим количеством голосов получит 4K релиз.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(season.finalCandidates || []).map((candidate, idx) => {
              const isUserVoted = user && candidate.voters && candidate.voters.includes(user.email);
              const pct = totalVotes > 0 ? Math.round((candidate.votes / totalVotes) * 100) : 0;
              const isLeading = idx === 0;

              return (
                <div
                  key={candidate.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                    isLeading
                      ? 'bg-gradient-to-b from-[#8B5CF6]/20 to-[#12131a] border-[#8B5CF6]/50 shadow-xl'
                      : 'bg-white/[0.04] border-white/10'
                  }`}
                >
                  <div className="flex gap-3.5">
                    <img
                      src={candidate.image}
                      alt={candidate.title}
                      className="w-16 h-24 object-cover rounded-xl shrink-0 bg-slate-800 shadow-lg"
                    />
                    <div className="flex-1 min-w-0">
                      {isLeading && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black uppercase inline-flex items-center gap-1 mb-1">
                          <Crown className="w-2.5 h-2.5" /> Лидер
                        </span>
                      )}
                      <h4 className="text-base font-bold text-white truncate">{candidate.title}</h4>
                      <p className="text-xs text-slate-400 truncate">{candidate.originalName}</p>
                      <div className="mt-2 text-xs font-mono font-bold text-[#A78BFA]">
                        {candidate.votes} голосов ({pct}%)
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10">
                    <button
                      onClick={() => handleVoteFinal(candidate.id)}
                      disabled={loadingVoteId === candidate.id}
                      className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer active:scale-95 flex items-center justify-center gap-2 ${
                        isUserVoted
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-lg shadow-[#8B5CF6]/30'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{isUserVoted ? 'Ваш голос зачтен' : 'Отдать голос'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STAGE 3: WINNER ANNOUNCEMENT */}
      {stage === 'winner' && season.winner && (
        <div className="relative z-10 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#8B5CF6]/20 via-[#12131a] to-[#1e1b4b] border border-[#8B5CF6]/40 flex flex-col sm:flex-row items-center gap-6 shadow-2xl">
          <img
            src={season.winner.image}
            alt={season.winner.title}
            className="w-28 sm:w-36 h-40 sm:h-52 object-cover rounded-2xl shrink-0 shadow-2xl border border-white/20"
          />
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase mb-2">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Победитель Сезона #{season.seasonNumber}</span>
            </div>
            <h3 className="text-xl sm:text-3xl font-display font-black text-white mb-1">
              {season.winner.title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mb-4 max-w-xl">
              Набрал наибольшее число голосов ({season.winner.votes} голосов) и отправлен в производство на добавление в честном 4K Ultra HD!
            </p>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
              <Link
                to={`/anime/${season.winner.animeId}`}
                className="px-5 py-2.5 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-[#8B5CF6]/30"
              >
                <PlayCircle className="w-4 h-4" />
                <span>Страница тайтла</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Suggest Modal */}
      <Suggest4KModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        onSuccess={(updatedState) => {
          setSeason(updatedState);
        }}
      />
    </section>
  );
};

export default Vote4KSection;
