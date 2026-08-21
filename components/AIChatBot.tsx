import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Trash2, Loader2, MessagesSquare, ChevronRight, Sparkles, LogIn, Crown, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import { AI_AVATAR_IMAGE } from '../utils/aiAvatar';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { ChatMessage as GlobalChatMessage } from '../types';

interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const CHAR_LIMIT = 200;
const COOLDOWN_SEC = 6;
const AI_AVATAR_SRC = AI_AVATAR_IMAGE || "/ai-chat.jpg";

export const AIChatBot: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'kamiai' | 'community'>('kamiai');
  
  // --- KamiAI Chat State ---
  const [aiMessages, setAiMessages] = useState<AIChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('kamianime_ai_chat');
      return saved ? JSON.parse(saved) : [
        {
          role: 'assistant',
          content: 'Привет! Я ИИ-ассистент KamiAnime. С удовольствием посоветую тебе аниме по твоему вкусу или настроению, расскажу о жанрах или отвечу на любые вопросы по аниме. Что у тебя сегодня на уме?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ];
    } catch {
      return [];
    }
  });
  
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0);

  // --- Community / Global Chat State ---
  const [communityMessages, setCommunityMessages] = useState<GlobalChatMessage[]>([]);
  const [isCommunityLoading, setIsCommunityLoading] = useState(false);
  const [communityInput, setCommunityInput] = useState('');
  const [isCommunitySending, setIsCommunitySending] = useState(false);
  const [communityCooldown, setCommunityCooldown] = useState(0);

  const aiMessagesEndRef = useRef<HTMLDivElement>(null);
  const commMessagesEndRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close selection menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  // Persist KamiAI messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('kamianime_ai_chat', JSON.stringify(aiMessages));
    } catch (e) {
      console.error(e);
    }
  }, [aiMessages]);

  // Scroll to bottom for active chat
  useEffect(() => {
    if (isChatOpen) {
      if (activeTab === 'kamiai') {
        aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      } else {
        commMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [isChatOpen, activeTab, aiMessages, communityMessages]);

  // Cooldown timers
  useEffect(() => {
    let timer: any;
    if (aiCooldown > 0) {
      timer = setInterval(() => setAiCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [aiCooldown]);

  useEffect(() => {
    let timer: any;
    if (communityCooldown > 0) {
      timer = setInterval(() => setCommunityCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [communityCooldown]);

  // Poll Global Messages when Community tab is active
  const fetchGlobalMessages = async () => {
    try {
      const msgs = await db.getGlobalMessages();
      if (Array.isArray(msgs)) {
        setCommunityMessages(msgs);
      }
    } catch (e) {
      console.warn('Failed to fetch global messages:', e);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isChatOpen && activeTab === 'community') {
      setIsCommunityLoading(true);
      fetchGlobalMessages().finally(() => setIsCommunityLoading(false));
      interval = setInterval(fetchGlobalMessages, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isChatOpen, activeTab]);

  // Handle KamiAI Send
  const handleAiSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || aiCooldown > 0) return;

    const userText = aiInput.trim().slice(0, CHAR_LIMIT);
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newMessages: AIChatMessage[] = [
      ...aiMessages,
      { role: 'user', content: userText, timestamp: userTimestamp }
    ];

    setAiMessages(newMessages);
    setAiInput('');
    setIsAiLoading(true);
    setAiCooldown(COOLDOWN_SEC);

    try {
      const historyForApi = newMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: historyForApi
        })
      });

      if (!res.ok) {
        throw new Error(`Ошибка сервера: ${res.status}`);
      }

      const data = await res.json();
      const replyText = data.text || 'Извините, не удалось сформировать ответ. Попробуйте еще раз.';

      setAiMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (error: any) {
      console.error('KamiAI error:', error);
      setAiMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Ошибка: ${error.message || 'Не удалось получить ответ от сервера. Пожалуйста, попробуйте позже.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleClearAiChat = () => {
    if (window.confirm('Очистить историю диалога с KamiAI?')) {
      const initialMsg: AIChatMessage = {
        role: 'assistant',
        content: 'Привет! Я ИИ-ассистент KamiAnime. С удовольствием посоветую тебе аниме по твоему вкусу или настроению, расскажу о жанрах или отвечу на любые вопросы по аниме. Что у тебя сегодня на уме?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setAiMessages([initialMsg]);
    }
  };

  // Handle Community Send
  const handleCommunitySend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!communityInput.trim() || isCommunitySending || communityCooldown > 0 || !user) return;

    const textToSend = communityInput.trim().slice(0, CHAR_LIMIT);
    setCommunityInput('');
    setIsCommunitySending(true);
    setCommunityCooldown(3);

    try {
      const newMsg = await db.sendGlobalMessage(user, textToSend);
      if (newMsg) {
        setCommunityMessages(prev => [...prev, newMsg]);
      }
    } catch (err: any) {
      console.error('Failed to send global message:', err);
    } finally {
      setIsCommunitySending(false);
    }
  };

  const openWindowWithTab = (tab: 'kamiai' | 'community') => {
    setActiveTab(tab);
    setIsMenuOpen(false);
    setIsChatOpen(true);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[100] font-sans" ref={menuRef}>
      {/* Selection Popup Menu when Bubble is clicked */}
      {isMenuOpen && !isChatOpen && (
        <div className="absolute bottom-20 right-0 w-72 bg-[#141320]/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-200 z-50 select-none">
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Выберите диалог</span>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1.5">
            {/* Option 1: KamiAI Assistant */}
            <button
              onClick={() => openWindowWithTab('kamiai')}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-[#8B5CF6]/15 hover:border-[#8B5CF6]/40 border border-transparent transition-all text-left cursor-pointer group"
            >
              <div className="relative w-10 h-10 shrink-0">
                <img
                  src={AI_AVATAR_SRC}
                  alt="KamiAI"
                  className="w-full h-full object-cover rounded-full border border-[#8B5CF6]/60 shadow-md group-hover:scale-105 transition-transform"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#12111A]"></span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white group-hover:text-[#A78BFA] transition-colors flex items-center gap-1.5">
                  <span>KamiAI</span>
                  <Sparkles className="w-3 h-3 text-[#A78BFA]" />
                </div>
                <p className="text-[10px] text-slate-400 truncate">ИИ-помощница & рекомендации</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </button>

            {/* Option 2: General / Community Chat */}
            <button
              onClick={() => openWindowWithTab('community')}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-sky-500/15 hover:border-sky-500/40 border border-transparent transition-all text-left cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <MessagesSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white group-hover:text-sky-400 transition-colors flex items-center gap-1.5">
                  <span>Общий чат</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                </div>
                <p className="text-[10px] text-slate-400 truncate">Живой чат сообщества</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* Circle Floating Trigger Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsMenuOpen(prev => !prev)}
          className="w-16 h-16 rounded-full bg-[#18132B] text-white flex items-center justify-center shadow-2xl border-2 border-[#8B5CF6]/60 hover:border-[#A78BFA] cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200 relative group p-0.5 shadow-[#8B5CF6]/30"
          id="ai-assistant-trigger"
          title="Открыть чаты (KamiAI & Общий)"
        >
          <img
            src={AI_AVATAR_SRC}
            alt="KamiAI"
            className="w-full h-full object-cover rounded-full"
          />
          {/* Online green indicator badge */}
          <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#12111A] shadow-md"></span>
          
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-[#12111A]/95 text-[11px] text-white px-3.5 py-2 rounded-2xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-2xl pointer-events-none whitespace-nowrap font-black uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md">
            <span>Чаты & KamiAI</span>
          </span>
        </button>
      )}

      {/* Small Chat Window */}
      {isChatOpen && (
        <div
          className="w-[350px] sm:w-[380px] h-[540px] bg-[#12111A]/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          id="ai-assistant-window"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-[#18132B] border-b border-white/5 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              {/* Tab Selector Buttons */}
              <div className="flex items-center gap-1 p-1 bg-black/40 border border-white/5 rounded-2xl">
                <button
                  onClick={() => setActiveTab('kamiai')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'kamiai'
                      ? 'bg-[#8B5CF6] text-white shadow-md shadow-[#8B5CF6]/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>KamiAI</span>
                </button>

                <button
                  onClick={() => setActiveTab('community')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'community'
                      ? 'bg-sky-500 text-white shadow-md shadow-sky-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MessagesSquare className="w-3.5 h-3.5" />
                  <span>Общий чат</span>
                </button>
              </div>

              {/* Action Buttons (Clear/Close) */}
              <div className="flex items-center gap-1">
                {activeTab === 'kamiai' && (
                  <button
                    onClick={handleClearAiChat}
                    className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                    title="Очистить историю KamiAI"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-1.5 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                  title="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* TAB 1: KamiAI Messages */}
          {activeTab === 'kamiai' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5">
                {aiMessages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {m.role === 'assistant' && (
                      <img
                        src={AI_AVATAR_SRC}
                        alt="KamiAI"
                        className="w-8 h-8 rounded-full border border-[#8B5CF6]/50 object-cover shadow-sm shrink-0 self-start mt-0.5"
                      />
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                        m.role === 'user'
                          ? 'bg-[#8B5CF6] text-white rounded-tr-sm font-medium'
                          : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-sm'
                      }`}
                    >
                      <div className="prose prose-invert prose-xs select-text text-left max-w-none text-slate-200">
                        <Markdown
                          components={{
                            a: ({ href, children, ...props }) => {
                              const isRelative = href?.startsWith('/');
                              if (isRelative) {
                                return (
                                  <Link
                                    to={href || ''}
                                    onClick={() => setIsChatOpen(false)}
                                    className="text-cyan-400 hover:text-cyan-300 font-extrabold underline decoration-2 decoration-cyan-400/50 hover:decoration-cyan-300 transition-colors cursor-pointer"
                                    {...props}
                                  >
                                    {children}
                                  </Link>
                                );
                              }
                              return (
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 font-extrabold underline decoration-2 decoration-cyan-400/50 hover:decoration-cyan-300 transition-colors"
                                  {...props}
                                >
                                  {children}
                                </a>
                              );
                            }
                          }}
                        >
                          {m.content}
                        </Markdown>
                      </div>
                      <div
                        className={`text-[9px] mt-1.5 font-bold ${
                          m.role === 'user' ? 'text-white/70 text-right' : 'text-slate-500 text-left'
                        }`}
                      >
                        {m.timestamp}
                      </div>
                    </div>
                  </div>
                ))}

                {isAiLoading && (
                  <div className="flex gap-2.5 justify-start items-center">
                    <img
                      src={AI_AVATAR_SRC}
                      alt="KamiAI"
                      className="w-8 h-8 rounded-full border border-[#8B5CF6]/50 object-cover shadow-sm shrink-0 self-start animate-bounce mt-0.5"
                    />
                    <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 text-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[#8B5CF6]" />
                      <span className="text-xs">KamiAI думает...</span>
                    </div>
                  </div>
                )}

                <div ref={aiMessagesEndRef} />
              </div>

              {/* Form KamiAI */}
              <form onSubmit={handleAiSend} className="p-3 bg-[#18132B] border-t border-white/5 flex flex-col gap-2">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value.slice(0, CHAR_LIMIT))}
                    placeholder={aiCooldown > 0 ? `Подождите ${aiCooldown}с...` : 'Спросите об аниме...'}
                    disabled={isAiLoading || aiCooldown > 0}
                    className="w-full pl-4 pr-11 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!aiInput.trim() || isAiLoading || aiCooldown > 0}
                    className="absolute right-1.5 p-2 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 disabled:hover:bg-[#8B5CF6] text-white rounded-xl transition-all cursor-pointer shadow-md disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex justify-between items-center px-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>{aiCooldown > 0 ? `Кулдаун: ${aiCooldown}с` : 'KamiAI Помощник'}</span>
                  <span>{aiInput.length}/{CHAR_LIMIT}</span>
                </div>
              </form>
            </>
          )}

          {/* TAB 2: Community General Chat Messages */}
          {activeTab === 'community' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-white/5">
                {isCommunityLoading && communityMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                    <span className="text-xs font-bold">Загрузка сообщений чата...</span>
                  </div>
                ) : communityMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center px-4 gap-2">
                    <MessageCircle className="w-8 h-8 text-slate-600" />
                    <p className="text-xs font-bold text-slate-400">В общем чате пока пусто</p>
                    <p className="text-[11px] text-slate-500">Станьте первым, кто напишет приветствие сообществу!</p>
                  </div>
                ) : (
                  communityMessages.map((msg) => {
                    const isOwn = user?.email && (msg.user?.email === user.email || (msg as any).user_email === user.email);
                    const formattedTime = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const userAvatar = msg.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.user?.name || 'User'}`;
                    const userName = msg.user?.name || 'Пользователь';
                    const userBadge = (msg.user as any)?.title_badge || (msg.user as any)?.badge;

                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-2.5 ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isOwn && (
                          <img
                            src={userAvatar}
                            alt={userName}
                            className="w-7 h-7 rounded-full border border-sky-500/30 object-cover shadow-sm shrink-0 self-start mt-1"
                          />
                        )}
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-md ${
                            isOwn
                              ? 'bg-sky-600 text-white rounded-tr-sm'
                              : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-sm'
                          }`}
                        >
                          {!isOwn && (
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="font-extrabold text-sky-400 text-[11px] truncate max-w-[140px]">
                                {userName}
                              </span>
                              {userBadge && (
                                <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 text-[9px] font-black uppercase tracking-wider border border-sky-500/30">
                                  {userBadge}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="leading-relaxed break-words select-text">{msg.text}</p>
                          <div
                            className={`text-[9px] mt-1 font-bold ${
                              isOwn ? 'text-sky-200 text-right' : 'text-slate-500 text-left'
                            }`}
                          >
                            {formattedTime}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={commMessagesEndRef} />
              </div>

              {/* Form Community */}
              <div className="p-3 bg-[#18132B] border-t border-white/5">
                {user ? (
                  <form onSubmit={handleCommunitySend} className="flex flex-col gap-2">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={communityInput}
                        onChange={(e) => setCommunityInput(e.target.value.slice(0, CHAR_LIMIT))}
                        placeholder={communityCooldown > 0 ? `Подождите ${communityCooldown}с...` : 'Написать в общий чат...'}
                        disabled={isCommunitySending || communityCooldown > 0}
                        className="w-full pl-4 pr-11 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!communityInput.trim() || isCommunitySending || communityCooldown > 0}
                        className="absolute right-1.5 p-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-white rounded-xl transition-all cursor-pointer shadow-md disabled:cursor-not-allowed"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex justify-between items-center px-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                      <span>{communityCooldown > 0 ? `Кулдаун: ${communityCooldown}с` : 'Чат сообщества'}</span>
                      <span>{communityInput.length}/{CHAR_LIMIT}</span>
                    </div>
                  </form>
                ) : (
                  <div className="py-2 px-3 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">Войдите, чтобы писать в чат</span>
                    <button
                      onClick={openAuthModal}
                      className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Войти</span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

