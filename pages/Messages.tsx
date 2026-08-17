import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, MessageSquare, Loader2, Copy, Check, Reply } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { PrivateMessage, User as UserType } from '../types';
import SEO from '../components/SEO';
import { RichTextarea } from '../components/RichTextarea';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

const Messages: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetEmail = searchParams.get('user');
  
  const [conversations, setConversations] = useState<{id?: string, email: string, name: string, avatar: string, lastText: string, hasUnread?: boolean}[]>([]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [targetUser, setTargetUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyLink = () => {
    const link = `${window.location.origin}/messages?user=${targetEmail}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Mark conversation as read locally when selected
  useEffect(() => {
    if (targetEmail && user?.email) {
      // Optimistic update
      setConversations(prev => prev.map(c => 
        c.email === targetEmail ? { ...c, hasUnread: false } : c
      ));
      
      // Explicit server update
      db.markMessagesAsRead(user.email, targetEmail).then(() => {
          // Notify layout after server update
          window.dispatchEvent(new Event('messages-read'));
      });
    }
  }, [targetEmail, user?.email]);

  // Load conversations list
  useEffect(() => {
    if (user?.email) {
      loadConversations();
    }
  }, [user?.email]);

  // Load target user if selected
  useEffect(() => {
    const loadTarget = async () => {
      if (targetEmail && user?.email) {
        setIsLoading(true);
        try {
          // Parallel fetch: Profile + Messages
          // Note: getPrivateMessages also marks as read, but we did it explicitly above too for safety
          const [profile, msgs] = await Promise.all([
            db.getProfile(targetEmail),
            db.getPrivateMessages(user.email, targetEmail)
          ]);
          
          if (profile) {
            setTargetUser(profile);
            setMessages(msgs);
            // Initial scroll to bottom
            setTimeout(() => {
              if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
              }
            }, 100);
          }
        } catch (error) {
          console.error('Failed to load chat target', error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setTargetUser(null);
      }
    };
    loadTarget();
  }, [targetEmail, user?.email]);

  // Poll for new messages every 3 seconds if chat is open
  useEffect(() => {
    if (!targetUser || !user?.email) return;

    let isPolling = false;
    const interval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        await loadMessages(targetUser.email);
      } finally {
        isPolling = false;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [targetUser, user?.email]);

  const loadConversations = async () => {
    if (!user) return;
    const convs = await db.getConversations(user.email);
    setConversations(convs);
  };

  const loadMessages = async (email: string) => {
    if (!user) return;
    const msgs = await db.getPrivateMessages(user.email, email);
    
    // Only scroll if message count changed
    const hadMessages = messages.length > 0;
    const gotNewMessages = msgs.length > messages.length;
    
    setMessages(msgs);
    
    if (gotNewMessages || !hadMessages) {
      scrollToBottom();
    }

    // Notify layout to update unread count
    window.dispatchEvent(new Event('messages-read'));
  };

  const scrollToBottom = () => {
    // Small timeout to ensure DOM is updated
    setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    }, 100);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !targetUser) return;

    const text = newMessage;
    setNewMessage(''); // Optimistic clear

    try {
      await db.sendPrivateMessage(user.email, targetUser.email, text);
      loadMessages(targetUser.email);
      loadConversations(); // Update last message in sidebar
    } catch (error) {
      console.error('Failed to send message', error);
      setNewMessage(text); // Restore on error
    }
  };

  const handleReplyToMessage = (msg: PrivateMessage) => {
    const senderName = msg.from === user?.email ? user.name : targetUser?.name || 'Пользователь';
    const quote = `> **${senderName}** писал(а):\n> ${msg.text.split('\n').join('\n> ')}\n\n`;
    setNewMessage((prev) => prev ? `${prev}\n${quote}` : quote);
    
    // Scroll to textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textarea.focus();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white pt-20">
        <div className="text-center">
            <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>Пожалуйста, войдите в аккаунт, чтобы пользоваться чатом.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark pt-24 pb-20 flex flex-col md:flex-row h-[calc(100vh-96px)] max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
      <SEO title="Сообщения - KamiAnime" />
      
      {/* Sidebar - Conversations List */}
      <div className={`w-full md:w-80 lg:w-96 bg-surface border border-white/5 rounded-2xl md:rounded-r-none flex flex-col overflow-hidden ${targetUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Сообщения
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Нет активных диалогов. Найдите друзей в <Link to="/social" className="text-primary hover:underline">Людях</Link>!
            </div>
          ) : (
            conversations.map(conv => (
              <Link 
                key={conv.email} 
                to={`/messages?user=${conv.email}`}
                className={`p-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5 ${targetEmail === conv.email ? 'bg-white/5 border-l-2 border-l-primary' : ''}`}
              >
                <div onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/user/${conv.name || conv.id || conv.email}`);
                }} className="relative cursor-pointer hover:opacity-80 transition-opacity">
                    <img src={conv.avatar} alt={conv.name} className="w-12 h-12 rounded-xl object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-white text-sm truncate">{conv.name}</div>
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                      {conv.lastText
                        .replace(/(\*\*|__)(.*?)\1/g, '$2')
                        .replace(/(\*|_)(.*?)\1/g, '$2')
                        .replace(/~~(.*?)~~/g, '$1')
                        .replace(/`([^`]+)`/g, '$1')
                        .replace(/^> (.*$)/gm, '$1')
                        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
                        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[Image]')
                      }
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-black/20 border border-white/5 border-l-0 rounded-2xl md:rounded-l-none overflow-hidden ${!targetUser ? 'hidden md:flex' : 'flex'}`}>
        {targetUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-surface border-b border-white/5 flex items-center gap-4">
              <Link to="/messages" className="md:hidden p-2 hover:bg-white/5 rounded-full text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <Link to={`/user/${targetUser.name || targetUser.id || targetUser.email}`} className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                  <img src={targetUser.avatar} alt={targetUser.name} className="w-10 h-10 rounded-full object-cover" />
                  <div>
                    <div className="font-bold text-white">{targetUser.name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                       <span className={`w-2 h-2 rounded-full ${targetUser.lastSeen && (new Date().getTime() - new Date(targetUser.lastSeen).getTime() < 5 * 60 * 1000) ? 'bg-green-500' : 'bg-slate-500'}`}></span> 
                       {targetUser.lastSeen && (new Date().getTime() - new Date(targetUser.lastSeen).getTime() < 5 * 60 * 1000) ? 'Онлайн' : 'Оффлайн'}
                    </div>
                  </div>
              </Link>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar flex flex-col">
              <div className="flex-1"></div> {/* Spacer to push messages down if few */}
              {messages.map(msg => {
                const isMe = msg.from === user.email;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}>
                    {!isMe && (
                      <button 
                        onClick={() => handleReplyToMessage(msg)}
                        className="mr-2 self-center opacity-0 group-hover:opacity-100 text-slate-500 hover:text-primary transition-colors p-1"
                        title="Ответить"
                      >
                        <Reply className="w-4 h-4" />
                      </button>
                    )}
                    <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3 ${isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-surface border border-white/10 text-slate-200 rounded-tl-none'}`}>
                      <div className={`text-sm leading-relaxed break-words markdown-body ${isMe ? 'markdown-body-me' : 'markdown-body-other'}`}>
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          remarkPlugins={[remarkGfm]}
                          components={{
                              u: ({node, ...props}: any) => <u {...props} />,
                              img: ({node, ...props}: any) => (
                                  <img 
                                      {...props} 
                                      className="max-w-full rounded-xl my-2 shadow-lg border border-white/10 object-contain max-h-[300px]" 
                                      loading="lazy" 
                                      alt={props.alt || "Изображение"} 
                                  />
                              ),
                              p: ({node, ...props}: any) => <p className="mb-2 last:mb-0" {...props} />,
                              a: ({node, ...props}: any) => <a className="underline hover:text-white/80 break-all" target="_blank" rel="noopener noreferrer" {...props} />
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-white/70' : 'text-slate-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                    {isMe && (
                      <button 
                        onClick={() => handleReplyToMessage(msg)}
                        className="ml-2 self-center opacity-0 group-hover:opacity-100 text-slate-500 hover:text-primary transition-colors p-1"
                        title="Ответить"
                      >
                        <Reply className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-4 bg-surface border-t border-white/5 flex gap-4 items-end">
              <div className="flex-1">
                <RichTextarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Напишите сообщение..."
                  className="min-h-[80px]"
                  onSubmit={() => handleSendMessage({ preventDefault: () => {} } as React.FormEvent)}
                />
              </div>
              <button 
                type="submit" 
                disabled={!newMessage.trim()}
                className="bg-primary hover:bg-primary/90 text-white p-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-[2px]"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageSquare className="w-20 h-20 mb-6 opacity-10" />
            <p className="font-bold uppercase tracking-widest text-xs">Выберите чат или начните новый</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Messages;
