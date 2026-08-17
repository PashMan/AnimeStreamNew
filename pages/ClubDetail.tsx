import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { Club, ClubMember, ClubMessage } from '../types';
import { RichTextarea } from '../components/RichTextarea';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { 
  Users, 
  MessageSquare, 
  Shield, 
  LogOut, 
  Send, 
  Loader2, 
  ArrowLeft,
  Settings,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Upload,
  UserPlus,
  UserMinus,
  Lock,
  Unlock
} from 'lucide-react';
import SEO from '../components/SEO';

const ClubDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [messages, setMessages] = useState<ClubMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [editClubName, setEditClubName] = useState('');
  const [editClubDesc, setEditClubDesc] = useState('');
  const [editClubAvatar, setEditClubAvatar] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [isUpdatingClub, setIsUpdatingClub] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeMembers = members.filter(m => m.status === 'active' || !m.status);
  const pendingMembers = members.filter(m => m.status === 'pending');
  
  const isMember = user && activeMembers.some(m => m.userId === user.id);
  const isPending = user && pendingMembers.some(m => m.userId === user.id);
  const userRole = user ? activeMembers.find(m => m.userId === user.id)?.role : null;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';

  useEffect(() => {
    if (!id) return;

    const loadClubData = async () => {
      setIsLoading(true);
      try {
        const clubData = await db.getClub(id);
        if (!clubData) {
          navigate('/social');
          return;
        }
        setClub(clubData);
        setEditClubName(clubData.name);
        setEditClubDesc(clubData.description || '');
        setEditClubAvatar(clubData.avatarUrl || '');
        setEditIsPrivate(clubData.isPrivate || false);

        const membersData = await db.getClubMembers(id);
        setMembers(membersData);

        const messagesData = await db.getClubMessages(id);
        setMessages(messagesData);
      } catch (error) {
        console.error('Error loading club:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadClubData();
  }, [id, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoin = async () => {
    if (!user?.id || !id || isJoining) return;
    setIsJoining(true);
    try {
      const success = await db.joinClub(id, user.id);
      if (success) {
        const updatedMembers = await db.getClubMembers(id);
        setMembers(updatedMembers);
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!user?.id || !id || !window.confirm('Вы уверены, что хотите покинуть клуб?')) return;
    try {
      const success = await db.leaveClub(id, user.id);
      if (success) {
        if (members.length === 1) {
          navigate('/social');
        } else {
          const updatedMembers = await db.getClubMembers(id);
          setMembers(updatedMembers);
        }
      }
    } catch (error) {
      console.error('Error leaving club:', error);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id || !id || !newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const success = await db.sendClubMessage(id, user.id, newMessage.trim());
      if (success) {
        setNewMessage('');
        const updatedMessages = await db.getClubMessages(id);
        setMessages(updatedMessages);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleEditMessage = async (msgId: string) => {
    if (!editContent.trim()) return;
    try {
      const success = await db.updateClubMessage(msgId, editContent.trim());
      if (success) {
        setEditingMessageId(null);
        const updatedMessages = await db.getClubMessages(id!);
        setMessages(updatedMessages);
      }
    } catch (error) {
      console.error('Error editing message:', error);
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!window.confirm('Удалить сообщение?')) return;
    try {
      const success = await db.deleteClubMessage(msgId);
      if (success) {
        const updatedMessages = await db.getClubMessages(id!);
        setMessages(updatedMessages);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  };

  const handleKick = async (userId: string) => {
    if (!id || !window.confirm('Выгнать участника?')) return;
    try {
      const success = await db.kickMember(id, userId);
      if (success) {
        setMembers(prev => prev.filter(m => m.userId !== userId));
        // Refresh messages to remove kicked user's messages
        const updatedMessages = await db.getClubMessages(id);
        setMessages(updatedMessages);
      }
    } catch (error) {
      console.error('Error kicking member:', error);
    }
  };

  const handleApprove = async (userId: string) => {
    if (!id) return;
    try {
      const success = await db.approveJoinRequest(id, userId);
      if (success) {
        const updatedMembers = await db.getClubMembers(id);
        setMembers(updatedMembers);
      }
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  const handleReject = async (userId: string) => {
    if (!id) return;
    try {
      const success = await db.rejectJoinRequest(id, userId);
      if (success) {
        setMembers(prev => prev.filter(m => m.userId !== userId));
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const handleUpdateClub = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || isUpdatingClub) return;
    setIsUpdatingClub(true);
    try {
      let avatarUrl = editClubAvatar;
      if (avatarFile) {
        const uploadedUrl = await db.uploadClubAvatar(avatarFile);
        if (uploadedUrl) avatarUrl = uploadedUrl;
      }

      const success = await db.updateClub(id, {
        name: editClubName,
        description: editClubDesc,
        avatarUrl: avatarUrl,
        isPrivate: editIsPrivate
      });
      if (success) {
        const updatedClub = await db.getClub(id);
        if (updatedClub) setClub(updatedClub);
        setShowSettings(false);
      }
    } finally {
      setIsUpdatingClub(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!club) return null;

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 py-10 min-h-screen pt-28 space-y-12 bg-[#141519]">
      <SEO title={`${club.name} - Клуб Сообщества`} description={club.description || ''} />
      
      <button 
        onClick={() => navigate('/social')}
        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-black uppercase tracking-widest">Назад к сообществу</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar: Club Info & Members */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-surface/30 rounded-3xl p-6 border border-white/5 backdrop-blur-md text-center">
            <img 
              src={club.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${club.name}`} 
              alt={club.name} 
              className="w-32 h-32 rounded-3xl mx-auto mb-6 object-cover shadow-2xl shadow-primary/20"
            />
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">{club.name}</h1>
            <div className="text-sm text-slate-400 mb-6 prose prose-invert prose-sm max-w-none break-words [&>p]:mb-0 [&>p:last-child]:mb-0">
              <ReactMarkdown 
                rehypePlugins={[rehypeRaw]} 
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({node, ...props}) => <img {...props} className="max-w-full rounded-lg my-2" />,
                  a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" />
                }}
              >
                {club.description || 'Нет описания'}
              </ReactMarkdown>
            </div>
            
            <div className="flex flex-col gap-3">
              {isMember ? (
                <button 
                  onClick={handleLeave}
                  className="w-full py-4 bg-white/5 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-red-500/20 hover:text-red-500 transition-all border border-white/5 flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Покинуть клуб
                </button>
              ) : isPending ? (
                <button 
                  disabled
                  className="w-full py-4 bg-yellow-500/20 text-yellow-500 text-xs font-black uppercase tracking-widest rounded-2xl border border-yellow-500/20 flex items-center justify-center gap-2 cursor-not-allowed"
                >
                  <Loader2 className="w-4 h-4 animate-spin" /> Заявка отправлена
                </button>
              ) : (
                <button 
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="w-full py-4 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-[#ff6e1a] transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isJoining ? <Loader2 className="animate-spin" /> : <Plus className="w-4 h-4" />} 
                  {club.isPrivate ? 'Подать заявку' : 'Вступить в клуб'}
                </button>
              )}
              {isAdmin && (
                <button 
                  onClick={() => setShowSettings(true)}
                  className="w-full py-4 bg-white/5 text-slate-400 text-xs font-black uppercase tracking-widest rounded-2xl hover:text-white transition-all border border-white/5 flex items-center justify-center gap-2"
                >
                  <Settings className="w-4 h-4" /> Настройки
                </button>
              )}
            </div>
          </div>

          <div className="bg-surface/30 rounded-3xl p-6 border border-white/5 backdrop-blur-md">
            <h2 className="text-lg font-black text-white uppercase tracking-tighter mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Участники ({activeMembers.length})
            </h2>
            
            {isAdmin && pendingMembers.length > 0 && (
              <div className="mb-6 space-y-3">
                <h3 className="text-xs font-black text-yellow-500 uppercase tracking-widest mb-2">Заявки ({pendingMembers.length})</h3>
                {pendingMembers.map(member => (
                  <div key={member.userId} className="flex items-center justify-between bg-yellow-500/10 p-2 rounded-xl border border-yellow-500/20">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={member.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.userId}`} className="w-6 h-6 rounded-lg" />
                      <span className="text-xs font-bold text-white truncate max-w-[80px]">{member.user?.name}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleApprove(member.userId)} className="p-1 bg-green-500/20 text-green-500 rounded hover:bg-green-500 hover:text-white transition-colors"><Check className="w-3 h-3" /></button>
                      <button onClick={() => handleReject(member.userId)} className="p-1 bg-red-500/20 text-red-500 rounded hover:bg-red-500 hover:text-white transition-colors"><X className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                <div className="h-px bg-white/10 my-4" />
              </div>
            )}

            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {activeMembers.map(member => (
                <div key={member.userId} className="flex items-center justify-between group/member">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={member.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${member.userId}`} alt={member.user?.name} className="w-8 h-8 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{member.user?.name}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{member.role}</div>
                    </div>
                  </div>
                  {member.role === 'admin' ? (
                    <Shield className="w-3 h-3 text-primary shrink-0" />
                  ) : isAdmin && (
                    <button 
                      onClick={() => handleKick(member.userId)}
                      className="opacity-0 group-hover/member:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                      title="Выгнать"
                    >
                      <UserMinus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content: Chat */}
        <div className="lg:col-span-3 flex flex-col h-[700px] bg-surface/30 rounded-3xl border border-white/5 backdrop-blur-md overflow-hidden">
          <div className="p-6 border-bottom border-white/5 bg-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-black text-white uppercase tracking-tighter">Общий чат</h2>
            </div>
          </div>

          {isMember ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500">
                  <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-xs font-bold uppercase tracking-widest">Сообщений пока нет. Начните общение!</p>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`flex gap-4 ${msg.userId === user?.id ? 'flex-row-reverse' : ''}`}>
                    <img src={msg.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.userId}`} alt={msg.user?.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                    <div className={`flex flex-col max-w-[70%] ${msg.userId === user?.id ? 'items-end' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">{msg.user?.name}</span>
                        <span className="text-[9px] text-slate-600 font-bold">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {(msg.userId === user?.id || isAdmin) && (
                          <div className="flex items-center gap-2 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {msg.userId === user?.id && (
                              <button 
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditContent(msg.content);
                                }}
                                className="text-slate-500 hover:text-white transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            )}
                            <button 
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="text-slate-500 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {editingMessageId === msg.id ? (
                        <div className="w-full bg-white/5 rounded-2xl p-2 flex flex-col gap-2">
                          <RichTextarea 
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-transparent border-none text-sm text-white focus:ring-0 resize-none p-2 min-h-[80px]"
                            placeholder="Редактировать сообщение..."
                          />
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => setEditingMessageId(null)}
                              className="p-1 text-slate-400 hover:text-white transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleEditMessage(msg.id)}
                              className="p-1 text-primary hover:text-violet-400 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className={`p-4 rounded-2xl text-sm group relative ${msg.userId === user?.id ? 'bg-primary text-white rounded-tr-none' : 'bg-white/5 text-slate-200 rounded-tl-none'}`}>
                          <div className="prose prose-invert prose-sm max-w-none break-words [&>p]:mb-0 [&>p:last-child]:mb-0">
                            <ReactMarkdown 
                              rehypePlugins={[rehypeRaw]} 
                              remarkPlugins={[remarkGfm]}
                              components={{
                                img: ({node, ...props}) => <img {...props} className="max-w-full rounded-lg my-2" />,
                                a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" />
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                          {(msg.userId === user?.id || isAdmin) && (
                            <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {msg.userId === user?.id && (
                                <button 
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditContent(msg.content);
                                  }}
                                  className="p-1.5 bg-surface/80 rounded-lg text-slate-400 hover:text-white border border-white/5"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteMessage(msg.id)}
                                className="p-1.5 bg-surface/80 rounded-lg text-slate-400 hover:text-red-500 border border-white/5"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8">
              <Lock className="w-16 h-16 mb-6 opacity-20" />
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-2">Чат недоступен</h3>
              <p className="text-xs font-bold uppercase tracking-widest mb-6">
                {isPending ? 'Ваша заявка на рассмотрении' : 'Вступите в клуб, чтобы видеть сообщения'}
              </p>
            </div>
          )}

          {isMember ? (
            <div className="p-6 bg-black/20 border-t border-white/5 flex flex-col gap-4">
              <RichTextarea 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Напишите сообщение..."
                className="min-h-[100px]"
                onSubmit={() => {
                   if (newMessage.trim() && !isSending) {
                     handleSendMessage({ preventDefault: () => {} } as React.FormEvent);
                   }
                }}
              />
              <div className="flex justify-end">
                <button 
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isSending}
                  className="px-8 py-3 bg-primary text-white rounded-2xl hover:bg-violet-600 transition-colors disabled:opacity-50 shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  {isSending ? <Loader2 className="animate-spin w-5 h-5" /> : <>Отправить <Send className="w-5 h-5" /></>}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-black/40 text-center border-t border-white/5">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Вступите в клуб, чтобы участвовать в чате</p>
              <button 
                onClick={handleJoin}
                className="px-8 py-3 bg-primary/20 text-primary border border-primary/30 rounded-xl hover:bg-primary hover:text-white transition-all font-black uppercase tracking-widest text-[10px]"
              >
                Вступить сейчас
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-black text-white uppercase tracking-tighter">Настройки клуба</h2>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateClub} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Название</label>
                <input 
                  type="text" 
                  value={editClubName}
                  onChange={(e) => setEditClubName(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-primary outline-none transition-colors"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Описание</label>
                <RichTextarea 
                  value={editClubDesc}
                  onChange={(e) => setEditClubDesc(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-b-2xl rounded-tr-2xl px-4 py-3 text-white focus:border-primary outline-none transition-colors resize-none min-h-[120px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Аватар</label>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={editClubAvatar}
                      onChange={(e) => setEditClubAvatar(e.target.value)}
                      placeholder="URL изображения"
                      className="w-full bg-black/20 border border-white/10 rounded-2xl px-4 py-3 text-white focus:border-primary outline-none transition-colors mb-2"
                    />
                    <div className="relative">
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setAvatarFile(e.target.files[0]);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="w-full py-3 bg-white/5 border border-dashed border-white/20 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:border-white/40 transition-all">
                        <Upload className="w-4 h-4" />
                        <span className="text-xs font-bold uppercase tracking-widest">
                          {avatarFile ? avatarFile.name : 'Загрузить файл'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {(editClubAvatar || avatarFile) && (
                    <img 
                      src={avatarFile ? URL.createObjectURL(avatarFile) : editClubAvatar} 
                      className="w-20 h-20 rounded-2xl object-cover bg-black/20" 
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                <div className={`w-10 h-6 rounded-full p-1 transition-colors cursor-pointer ${editIsPrivate ? 'bg-primary' : 'bg-slate-700'}`} onClick={() => setEditIsPrivate(!editIsPrivate)}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editIsPrivate ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Закрытый клуб</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Вступление только по заявкам</div>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isUpdatingClub}
                className="w-full py-4 bg-primary text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-violet-600 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isUpdatingClub ? <Loader2 className="animate-spin mx-auto" /> : 'Сохранить изменения'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClubDetail;
