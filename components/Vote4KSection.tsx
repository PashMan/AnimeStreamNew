import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Crown, 
  Sparkles, 
  Plus, 
  Clock, 
  Flame, 
  Check, 
  ChevronRight, 
  ThumbsUp, 
  Trophy, 
  Hourglass,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Vote4KSeason, Vote4KSuggestion, Vote4KFinalCandidate } from '../types';
import { Vote4KService } from '../services/vote4k';
import { useAuth } from '../context/AuthContext';
import { Image } from './Image';
import Suggest4KModal from './Suggest4KModal';

export const Vote4KSection: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const [seasonData, setSeasonData] = useState<Vote4KSeason | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState<boolean>(false);
  const [votingLoadingId, setVotingLoadingId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number }>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  const loadData = useCallback(async () => {
    try {
      const state = await Vote4KService.getState();
      setSeasonData(state);
    } catch (err) {
      console.error('[Vote4K] Error loading state:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time Countdown Timer
  useEffect(() => {
    if (!seasonData) return;

    const updateTimer = () => {
      const diff = Math.max(0, seasonData.stageEndTime - Date.now());
      if (diff <= 0) {
        // Stage timed out, refresh from server to advance stage
        loadData();
        return;
      }

      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / (3600 * 24));
      const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [seasonData, loadData]);

  const handleUpvoteSuggestion = async (suggestion: Vote4KSuggestion) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setVotingLoadingId(suggestion.id);
    try {
      const res = await Vote4KService.upvoteSuggestion(suggestion.id, user.email);
      if (res.success) {
        setSeasonData(res.state);
      }
    } catch (err) {
      console.error('Upvote error:', err);
    } finally {
      setVotingLoadingId(null);
    }
  };

  const handleFinalVote = async (candidate: Vote4KFinalCandidate) => {
    if (!user) {
      openAuthModal();
      return;
    }

    setVotingLoadingId(candidate.id);
    try {
      const res = await Vote4KService.voteFinal(candidate.id, user.email);
      if (res.success) {
        setSeasonData(res.state);
      }
    } catch (err) {
      console.error('Final vote error:', err);
    } finally {
      setVotingLoadingId(null);
    }
  };

  // Calculations for Stage 2 (Voting totals and percentages)
  const totalFinalVotes = useMemo(() => {
    if (!seasonData || !seasonData.finalCandidates) return 0;
    return seasonData.finalCandidates.reduce((acc, c) => acc + c.votes, 0);
  }, [seasonData]);

  if (isLoading && !seasonData) {
    return (
      <section className="relative z-10 animate-pulse">
        <div className="h-64 bg-[#1c1d21]/40 border border-white/5 rounded-2xl"></div>
      </section>
    );
  }

  if (!seasonData) return null;

  const { stage, seasonNumber, suggestions, finalCandidates, winner } = seasonData;
  const userEmail = user?.email;

  return (
    <section className="relative z-10">
      {/* Container with sleek neon gradients */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-[#1c1d24] via-[#16171b] to-[#121316] p-6 sm:p-8 lg:p-10 shadow-2xl shadow-purple-950/20">
        
        {/* Glow ambient background orbs */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-[#8B5CF6]/15 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-[#EC4899]/10 blur-3xl pointer-events-none" />

        {/* Top Header Row */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 text-[#A78BFA] text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />
                4K Ultra HD Релиз
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-bold">
                Сезон #{seasonNumber}
              </span>
              
              {/* Phase Badge */}
              {stage === 'suggestions' && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-black uppercase tracking-wide flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Этап 1: Сбор предложений (2 дня)
                </span>
              )}
              {stage === 'voting' && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#8B5CF6]/20 border border-[#8B5CF6]/30 text-[#C4B5FD] text-xs font-black uppercase tracking-wide flex items-center gap-1">
                  <Flame className="w-3 h-3 text-[#8B5CF6]" /> Этап 2: Финал (3 дня)
                </span>
              )}
              {stage === 'winner' && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wide flex items-center gap-1">
                  <Trophy className="w-3 h-3" /> Этап 3: Победитель (2 дня)
                </span>
              )}
              {stage === 'cooldown' && (
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs font-black uppercase tracking-wide flex items-center gap-1">
                  <Hourglass className="w-3 h-3" /> Перерыв (1 неделя)
                </span>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
              {stage === 'suggestions' && 'Голосование за следующий 4K релиз'}
              {stage === 'voting' && 'Финальная битва: Выберите 4K релиз'}
              {stage === 'winner' && 'Победитель 4K голосования определен!'}
              {stage === 'cooldown' && 'Перерыв перед следующим 4K голосованием'}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {stage === 'suggestions' && (
                <>Предлагайте свои предпочтения в течение <strong>2 дней</strong> и голосуйте за варианты других. <strong>Топ-5 тайтлов с максимальным числом голосов</strong> выйдут в финальное 3-дневное голосование!</>
              )}
              {stage === 'voting' && (
                <>Голосуйте за 1 из 5 лучших тайтлов-финалистов. Голосование длится 3 дня — победитель будет обработан и добавлен в 4K UHD!</>
              )}
              {stage === 'winner' && (
                <>По итогам голосования победил выбранный сообществом тайтл! Он передан на конвертацию в 4K UHD и скоро появится в плеере.</>
              )}
              {stage === 'cooldown' && (
                <>Новый сезон голосования начнется совсем скоро. Предлагайте идеи и следите за новыми 4K релизами!</>
              )}
            </p>
          </div>

          {/* Countdown Clock Widget */}
          <div className="shrink-0 flex items-center gap-2 bg-black/40 border border-white/10 backdrop-blur-md px-4 py-3 rounded-2xl">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold uppercase tracking-wider mr-2">
              <Clock className="w-4 h-4 text-[#8B5CF6]" />
              <span className="hidden sm:inline">До смены этапа:</span>
            </div>
            <div className="flex items-center gap-1.5 text-center font-mono">
              <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/5 min-w-[36px]">
                <span className="text-sm sm:text-base font-black text-white">{timeLeft.days}</span>
                <span className="block text-[8px] text-slate-500 uppercase font-sans">дн</span>
              </div>
              <span className="text-slate-600 font-bold">:</span>
              <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/5 min-w-[36px]">
                <span className="text-sm sm:text-base font-black text-white">{String(timeLeft.hours).padStart(2, '0')}</span>
                <span className="block text-[8px] text-slate-500 uppercase font-sans">ч</span>
              </div>
              <span className="text-slate-600 font-bold">:</span>
              <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/5 min-w-[36px]">
                <span className="text-sm sm:text-base font-black text-white">{String(timeLeft.minutes).padStart(2, '0')}</span>
                <span className="block text-[8px] text-slate-500 uppercase font-sans">мин</span>
              </div>
              <span className="text-slate-600 font-bold">:</span>
              <div className="px-2 py-1 bg-white/5 rounded-lg border border-white/5 min-w-[36px]">
                <span className="text-sm sm:text-base font-black text-[#A78BFA]">{String(timeLeft.seconds).padStart(2, '0')}</span>
                <span className="block text-[8px] text-[#8B5CF6] uppercase font-sans">сек</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Body according to Stage */}
        <div className="relative z-10 pt-6">

          {/* ========================================================
              STAGE 1: SUGGESTIONS & PRE-VOTING
             ======================================================== */}
          {stage === 'suggestions' && (
            <div className="space-y-6">
              {/* Actions & Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      Всего предложено тайтлов:
                      <span className="text-[#A78BFA] font-black">{suggestions?.length || 0}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Через 2 дня топ-5 аниме по голосам автоматически перейдут в финал
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!user) {
                      openAuthModal();
                    } else {
                      setIsSuggestModalOpen(true);
                    }
                  }}
                  className="px-5 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-[#8B5CF6]/25 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Предложить своё аниме
                </button>
              </div>

              {/* Suggestions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {suggestions && suggestions.length > 0 ? (
                  [...suggestions]
                    .sort((a, b) => b.votes - a.votes)
                    .map((sug, idx) => {
                      const hasVoted = userEmail ? sug.voters.includes(userEmail) : false;
                      const isInTop5 = idx < 5;

                      return (
                        <div
                          key={sug.id}
                          className={`group relative rounded-2xl p-3.5 bg-[#141519]/80 border transition-all duration-300 flex flex-col justify-between ${
                            hasVoted
                              ? 'border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/10'
                              : 'border-white/5 hover:border-white/15'
                          }`}
                        >
                          <div className="flex gap-3">
                            {/* Anime Poster */}
                            <div className="relative w-16 h-24 rounded-xl overflow-hidden shrink-0 bg-neutral-900 border border-white/10 shadow-md">
                              <Image
                                src={sug.image}
                                alt={sug.title}
                                animeId={sug.animeId}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-black text-white">
                                #{idx + 1}
                              </div>
                            </div>

                            {/* Details */}
                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                              <div>
                                <h4 className="text-sm font-bold text-white group-hover:text-[#8B5CF6] transition-colors line-clamp-2 leading-tight">
                                  {sug.title}
                                </h4>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {sug.originalName || sug.year}
                                </p>
                              </div>

                              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                                <span className="truncate max-w-[100px]">
                                  от {sug.suggestedBy?.name || 'Пользователя'}
                                </span>
                                {isInTop5 && (
                                  <span className="text-[#A78BFA] font-bold flex items-center gap-0.5">
                                    <Check className="w-3 h-3 text-[#8B5CF6]" /> В топ-5
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Vote Action Bar */}
                          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs font-black text-white">
                              <span className="text-[#A78BFA]">{sug.votes}</span>
                              <span className="text-[11px] font-normal text-slate-400">
                                {sug.votes === 1 ? 'голос' : sug.votes < 5 ? 'голоса' : 'голосов'}
                              </span>
                            </div>

                            <button
                              disabled={votingLoadingId === sug.id}
                              onClick={() => handleUpvoteSuggestion(sug)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                hasVoted
                                  ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10'
                              }`}
                            >
                              <ThumbsUp className={`w-3.5 h-3.5 ${hasVoted ? 'fill-current' : ''}`} />
                              {hasVoted ? 'Поддержано' : '+1 Голос'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    <p className="text-sm font-bold text-slate-400 mb-2">Пока нет предложений</p>
                    <button
                      onClick={() => setIsSuggestModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-[#8B5CF6] text-white text-xs font-bold"
                    >
                      Станьте первым, кто предложит тайтл!
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              STAGE 2: FINAL VOTING (TOP 5)
             ======================================================== */}
          {stage === 'voting' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {finalCandidates && finalCandidates.length > 0 ? (
                  finalCandidates.map((candidate, idx) => {
                    const hasVoted = userEmail ? candidate.voters.includes(userEmail) : false;
                    const percent = totalFinalVotes > 0 ? Math.round((candidate.votes / totalFinalVotes) * 100) : 0;
                    const isLeading = idx === 0 && candidate.votes > 0;

                    return (
                      <div
                        key={candidate.id}
                        className={`group relative rounded-2xl overflow-hidden bg-[#141519]/90 border transition-all duration-300 flex flex-col justify-between ${
                          hasVoted
                            ? 'border-[#8B5CF6] shadow-xl shadow-[#8B5CF6]/20 ring-1 ring-[#8B5CF6]'
                            : isLeading
                            ? 'border-amber-500/40 shadow-lg'
                            : 'border-white/10 hover:border-white/20'
                        }`}
                      >
                        {/* Poster Frame */}
                        <div className="relative aspect-[3/4] w-full overflow-hidden bg-neutral-900">
                          <Image
                            src={candidate.image}
                            alt={candidate.title}
                            animeId={candidate.animeId}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#141519] via-transparent to-black/40" />

                          {/* Ranking Badge */}
                          <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-black text-white border border-white/10 flex items-center gap-1">
                            {isLeading && <Crown className="w-3 h-3 text-amber-400 fill-amber-400" />}
                            #{idx + 1}
                          </div>

                          {/* 4K UHD Target Tag */}
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-[#8B5CF6]/80 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-wider">
                            4K
                          </div>
                        </div>

                        {/* Candidate Content & Progress */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <h4 className="text-sm font-bold text-white group-hover:text-[#8B5CF6] transition-colors line-clamp-2 leading-snug">
                              {candidate.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {candidate.originalName || candidate.year}
                            </p>
                          </div>

                          {/* Votes Percentage Bar */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-bold">
                              <span className="text-slate-400">{candidate.votes} голосов</span>
                              <span className="text-[#A78BFA] font-mono font-black">{percent}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden p-0.5 border border-white/5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#EC4899] transition-all duration-500"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>

                          {/* Vote Action */}
                          <button
                            disabled={votingLoadingId === candidate.id}
                            onClick={() => handleFinalVote(candidate)}
                            className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              hasVoted
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                                : 'bg-[#8B5CF6] hover:bg-[#7C3AED] text-white shadow-lg shadow-[#8B5CF6]/20 hover:scale-[1.02] active:scale-[0.98]'
                            }`}
                          >
                            {hasVoted ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> Ваш выбор
                              </>
                            ) : (
                              'Проголосовать'
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full py-12 text-center text-slate-500">
                    Формирование финалистов...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              STAGE 3: WINNER ANNOUNCED
             ======================================================== */}
          {stage === 'winner' && winner && (
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-amber-500/10 via-[#8B5CF6]/15 to-transparent border border-amber-500/30 flex flex-col md:flex-row items-center gap-6 md:gap-8">
              <div className="relative w-36 sm:w-44 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border-2 border-amber-400/50">
                <Image
                  src={winner.image}
                  alt={winner.title}
                  animeId={winner.animeId}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2 py-1 rounded bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-lg">
                  <Crown className="w-3 h-3 fill-current" /> Победитель
                </div>
              </div>

              <div className="flex-1 text-center md:text-left space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider">
                  <Trophy className="w-3.5 h-3.5" /> Выбор сообщества KamiAnime
                </div>

                <h3 className="text-2xl sm:text-3xl font-display font-black text-white">
                  {winner.title}
                </h3>

                <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">
                  Тайтл набрал наибольшее количество голосов (<strong>{winner.votes}</strong>) и официально победил в Сезоне #{seasonNumber}! Команда уже запустила процесс подготовки и мастеринга в 4K Ultra HD.
                </p>

                <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
                  <Link
                    to={`/anime/${winner.animeId}`}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-amber-500/20 transition-all hover:scale-105"
                  >
                    Страница тайтла <ArrowUpRight className="w-4 h-4" />
                  </Link>
                  <span className="text-xs font-semibold text-slate-400">
                    Статус: <span className="text-amber-400 font-bold">В производстве 4K</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              STAGE 4: COOLDOWN (1 WEEK)
             ======================================================== */}
          {stage === 'cooldown' && (
            <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6]">
                <Hourglass className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-white">
                Сезон #{seasonNumber} успешно завершен!
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                Следующий сезон голосования начнется совсем скоро. Готовьте свои любимые тайтлы для следующей 4K битвы!
              </p>
              <div className="pt-2">
                <Link
                  to="/premium"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-[#8B5CF6]/20 transition-all"
                >
                  <Crown className="w-4 h-4" /> Смотреть текущие 4K релизы
                </Link>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Suggest 4K Modal */}
      <Suggest4KModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        onSuccess={(updatedState) => {
          setSeasonData(updatedState);
        }}
      />
    </section>
  );
};

export default Vote4KSection;
