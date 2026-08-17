import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send, Trash2, Sparkles, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const CHAR_LIMIT = 150;
const COOLDOWN_SEC = 8;

export const AIChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
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

  useEffect(() => {
    try {
      localStorage.setItem('kamianime_ai_chat', JSON.stringify(messages));
    } catch (e) {
      console.error(e);
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, messages]);

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

    const userMsgText = input.trim();
    if (userMsgText.length > CHAR_LIMIT) return;

    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMessage: ChatMessage = {
      role: 'user',
      content: userMsgText,
      timestamp: timeString
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);
    setCooldown(COOLDOWN_SEC);

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content
      }));

      const res = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: apiMessages })
      });

      if (!res.ok) {
        const errData = await res.json() as any;
        throw new Error(errData.error || 'Ошибка при получении рекомендации.');
      }

      const resData = await res.json() as any;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: resData.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (error: any) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
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
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[100] font-sans">
      {/* Circle Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#06B6D4] text-white flex items-center justify-center shadow-2xl cursor-pointer hover:scale-115 active:scale-90 transition-all duration-300 relative group"
          id="ai-assistant-trigger"
          title="Рекомендации ИИ"
        >
          <Sparkles className="w-6 h-6 animate-pulse group-hover:rotate-12 transition-transform duration-300" />
          <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-[#12111A]/95 text-[10px] text-white px-3 py-2 rounded-xl border border-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl pointer-events-none whitespace-nowrap font-black uppercase tracking-widest">
            ИИ подбор аниме ✨
          </span>
        </button>
      )}

      {/* Small Chat Window */}
      {isOpen && (
        <div
          className="w-[350px] sm:w-[380px] h-[500px] bg-[#12111A]/95 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          id="ai-assistant-window"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#18132B] to-[#0A1224] border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8B5CF6]/20 to-[#06B6D4]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6]">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                  KamiAI Помощник
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                </div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Подбор аниме 24/7</p>
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
                onClick={() => setIsOpen(false)}
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
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 self-start">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-lg ${
                    m.role === 'user'
                      ? 'bg-primary text-white rounded-tr-sm font-medium'
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
                                onClick={() => setIsOpen(false)}
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
                  <div className="text-[8px] opacity-60 text-right mt-1.5 font-bold uppercase tracking-wider">
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-[#8B5CF6]/30 flex items-center justify-center text-[#8B5CF6] shrink-0 self-start animate-bounce">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 text-slate-300 text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="font-bold text-[10px] uppercase tracking-wider text-slate-400">Ассистент думает...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Input Form */}
          <form
            onSubmit={handleSend}
            className="p-4 bg-black/40 border-t border-white/5 flex flex-col gap-2"
          >
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Что любишь? Напиши жанр или сюжет..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={CHAR_LIMIT}
                disabled={isLoading}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-primary/40 transition-colors placeholder:text-slate-500 font-bold disabled:opacity-55"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || cooldown > 0}
                className="absolute right-2.5 w-8 h-8 rounded-xl bg-primary hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center transition-all cursor-pointer text-xs font-black shrink-0 shadow-lg"
              >
                {cooldown > 0 ? (
                  <span className="font-black text-[10px]">{cooldown}</span>
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between px-1 text-[9px] text-slate-500 font-black uppercase tracking-wider">
              <span>{cooldown > 0 ? `Пауза: ${cooldown} сек` : 'Рекомендации KamiAI'}</span>
              <span className={input.length >= CHAR_LIMIT ? 'text-red-400 font-bold animate-pulse' : ''}>
                {input.length} / {CHAR_LIMIT}
              </span>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
