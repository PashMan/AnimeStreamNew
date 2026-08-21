import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Trash2, Loader2, Bot, MessagesSquare, ChevronRight, MessageSquare, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';
import { AI_AVATAR_IMAGE } from '../utils/aiAvatar';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const CHAR_LIMIT = 150;
const COOLDOWN_SEC = 8;
const AI_AVATAR_SRC = AI_AVATAR_IMAGE || "/ai-chat.jpg";

export const AIChatBot: React.FC = () => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
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
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    try {
      localStorage.setItem('kamianime_ai_chat', JSON.stringify(messages));
    } catch (e) {
      console.error(e);
    }
  }, [messages]);

  useEffect(() => {
    if (isAiChatOpen) {
      scrollToBottom();
    }
  }, [isAiChatOpen, messages]);

  useEffect(() => {
    let timer: any;
    if (cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || cooldown > 0) return;

    const userText = input.trim().slice(0, CHAR_LIMIT);
    const userTimestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: userText, timestamp: userTimestamp }
    ];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setCooldown(COOLDOWN_SEC);

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

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (error: any) {
      console.error('KamiAI error:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Ошибка: ${error.message || 'Не удалось получить ответ от сервера. Пожалуйста, попробуйте позже.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (window.confirm('Очистить историю чата?')) {
      const initialMsg: ChatMessage = {
        role: 'assistant',
        content: 'Привет! Я ИИ-ассистент KamiAnime. С удовольствием посоветую тебе аниме по твоему вкусу или настроению, расскажу о жанрах или отвечу на любые вопросы по аниме. Что у тебя сегодня на уме?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([initialMsg]);
    }
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[100] font-sans" ref={menuRef}>
      {/* Selection Popup Menu when Bubble is clicked */}
      {isMenuOpen && !isAiChatOpen && (
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
              onClick={() => {
                setIsMenuOpen(false);
                setIsAiChatOpen(true);
              }}
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
              onClick={() => {
                setIsMenuOpen(false);
                navigate('/forum');
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 hover:bg-sky-500/15 hover:border-sky-500/40 border border-transparent transition-all text-left cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shrink-0 shadow-md group-hover:scale-105 transition-transform">
                <MessagesSquare className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white group-hover:text-sky-400 transition-colors">
                  Общий чат / Форум
                </div>
                <p className="text-[10px] text-slate-400 truncate">Обсуждения с сообществом</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* Circle Floating Trigger Button */}
      {!isAiChatOpen && (
        <button
          onClick={() => setIsMenuOpen(prev => !prev)}
          className="w-16 h-16 rounded-full bg-[#18132B] text-white flex items-center justify-center shadow-2xl border-2 border-[#8B5CF6]/60 hover:border-[#A78BFA] cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200 relative group p-0.5 shadow-[#8B5CF6]/30"
          id="ai-assistant-trigger"
          title="Открыть чат (KamiAI / Общий)"
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
      {isAiChatOpen && (
        <div
          className="w-[350px] sm:w-[380px] h-[520px] bg-[#12111A]/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          id="ai-assistant-window"
        >
          {/* Header */}
          <div className="px-5 py-3.5 bg-[#18132B] border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={AI_AVATAR_SRC}
                  alt="KamiAI"
                  className="w-10 h-10 rounded-full border-2 border-[#8B5CF6]/60 object-cover shadow-md"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#18132B]"></span>
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                  KamiAI Помощница
                </div>
                <p className="text-[10px] text-slate-400 font-bold tracking-wide">Подбор аниме & рекомендации</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleClearChat}
                className="p-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                title="Очистить историю"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsAiChatOpen(false)}
                className="p-2 hover:bg-white/5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/5">
            {messages.map((m, idx) => (
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
                                onClick={() => setIsAiChatOpen(false)}
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

            {isLoading && (
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

            <div ref={messagesEndRef} />
          </div>

          {/* Input & Form */}
          <form onSubmit={handleSend} className="p-3 bg-[#18132B] border-t border-white/5 flex flex-col gap-2">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, CHAR_LIMIT))}
                placeholder={cooldown > 0 ? `Подождите ${cooldown}с...` : 'Спросите об аниме...'}
                disabled={isLoading || cooldown > 0}
                className="w-full pl-4 pr-11 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#8B5CF6] transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || cooldown > 0}
                className="absolute right-1.5 p-2 bg-[#8B5CF6] hover:bg-[#7C3AED] disabled:opacity-40 disabled:hover:bg-[#8B5CF6] text-white rounded-xl transition-all cursor-pointer shadow-md disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Subtext info */}
            <div className="flex justify-between items-center px-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
              <span>{cooldown > 0 ? `Кулдаун: ${cooldown}с` : 'Лимит символов'}</span>
              <span>{input.length}/{CHAR_LIMIT}</span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
