import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Send, User, ArrowLeft, Loader2, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { PrivateMessage, User as UserType } from '../types';
import SEO from '../components/SEO';

const Chat: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const targetEmail = searchParams.get('user');
  
  const [conversations, setConversations] = useState<{email: string, name: string, avatar: string, lastText: string}[]>([]);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [targetUser, setTargetUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations list
  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  // Load target user if selected
  useEffect(() => {
    const loadTarget = async () => {
      if (targetEmail && user) {
        setIsLoading(true);
        const profile = await db.getProfile(targetEmail);
        if (profile) {
            setTargetUser(profile);
            loadMessages(profile.email);
        }
        setIsLoading(false);
      }
    };
    loadTarget();
  }, [targetEmail, user]);

  // Poll for new messages every 3 seconds if chat is open
  useEffect(() => {
    if (!targetUser || !user) return;

    const interval = setInterval(() => {
      loadMessages(targetUser.email);
    }, 3000);

    return () => clearInterval(interval);
  }, [targetUser, user]);

  const loadConversations = async () => {
    if (!user) return;
    const convs = await db.getConversations(user.email);
    setConversations(convs);
  };

  const loadMessages = async (email: string) => {
    if (!user) return;
    const msgs = await db.getPrivateMessages(user.email, email);
    setMessages(msgs);
    scrollToBottom();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <p>Пожалуйста, войдите в аккаунт, чтобы пользоваться чатом.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark pt-20 pb-20 flex flex-col md:flex-row h-[calc(100vh-80px)]">
      <SEO title="Сообщения - KamiAnime" />
      
      {/* Sidebar - Conversations List */}
      <div className={`w-full md:w-80 bg-surface border-r border-white/5 flex flex-col ${targetUser ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-white/5">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Сообщения
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">
              Нет активных диалогов. Найдите друзей в <Link to="/community" className="text-primary hover:underline">Сообществе</Link>!
            </div>
          ) : (
            conversations.map(conv => (
              <Link 
                key={conv.email} 
                to={`/messages?user=${conv.email}`}
                className={`p-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5 ${targetEmail === conv.email ? 'bg-white/5 border-l-2 border-l-primary' : ''}`}
              >
                <img src={conv.avatar} alt={conv.name} className="w-10 h-10 rounded-full object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">{conv.name}</div>
                  <div className="text-xs text-slate-400 truncate">{conv.lastText}</div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex-1 flex flex-col bg-black/20 ${!targetUser ? 'hidden md:flex' : 'flex'}`}>
        {targetUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-surface border-b border-white/5 flex items-center gap-4">
              <Link to="/messages" className="md:hidden p-2 hover:bg-white/5 rounded-full text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <img src={targetUser.avatar} alt={targetUser.name} className="w-10 h-10 rounded-full object-cover" />
              <div>
                <div className="font-bold text-white">{targetUser.name}</div>
                <div className="text-xs text-slate-500 flex items-center gap-1">
                   <span className="w-2 h-2 bg-green-500 rounded-full"></span> Онлайн
                </div>
              </div>
            </div>

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map(msg => {
                const isMe = msg.from === user.email;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-surface border border-white/10 text-slate-200 rounded-tl-none'}`}>
                      <p className="text-sm">{msg.text}</p>
                      <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-white/70' : 'text-slate-500'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSendMessage} className="p-4 bg-surface border-t border-white/5 flex gap-4">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Напишите сообщение..."
                className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button 
                type="submit" 
                disabled={!newMessage.trim()}
                className="bg-primary hover:bg-primary/90 text-white p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p>Выберите чат или начните новый</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
