import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';
import { Report, User } from '../types';
import { Shield, AlertTriangle, Trash2, UserX, MessageSquareOff, CheckCircle, XCircle, FileText, Send, Download } from 'lucide-react';
import { containsProfanity } from '../utils/profanity';
import { AdminSeoPanel } from '../components/AdminSeoPanel';
import { PYTHON_BOT_SCRIPT } from '../utils/telegramBotScript';

const translateType = (type: string) => {
  switch(type) {
    case 'review': return 'отзыв';
    case 'comment': return 'комментарий';
    case 'topic': return 'тему';
    case 'user': return 'пользователя';
    default: return type;
  }
};

const AdminPanel: React.FC = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'profanity' | 'dmca' | 'slug' | 'users' | 'seo' | 'bot'>('reports');
  const [profaneContent, setProfaneContent] = useState<any[]>([]);
  const [dmcaBlocks, setDmcaBlocks] = useState<string[]>([]);
  const [slugBlocks, setSlugBlocks] = useState<string[]>([]);
  const [newDmcaId, setNewDmcaId] = useState('');
  const [newSlugId, setNewSlugId] = useState('');
  const [users, setUsers] = useState<User[]>([]);

  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'moderator') {
      loadAdminData();
    }
  }, [user?.email, user?.role]);

  const loadAdminData = async () => {
    if (initialLoad) setLoading(true);
    try {
      // Load reports
      const fetchedReports = await db.getReports();
      setReports(fetchedReports);

      const fetchedDmca = await db.getDmcaBlocks();
      setDmcaBlocks(fetchedDmca);

      const fetchedSlugBlocks = await db.getSlugBlocks();
      setSlugBlocks(fetchedSlugBlocks);

      if (user?.role === 'admin') {
        const fetchedUsers = await db.getAllUsers();
        setUsers(fetchedUsers);
      }

      // In a real app, we would query the DB for all recent comments/reviews/topics
      // and filter them server-side. For this demo, we'll fetch a limited set or 
      // rely on reports primarily.
      // Let's simulate fetching recent content to check for profanity
      // (This is a simplified approach for demonstration)
      
      // Example: Fetching some recent topics to check
      const topics = await db.getForumTopics(undefined, undefined, 100);
      const flaggedTopics = topics.filter(t => containsProfanity(t.title) || containsProfanity(t.content)).map(t => ({
        type: 'topic',
        id: t.id,
        content: t.title + ' - ' + t.content,
        author: t.author.name
      }));

      setProfaneContent([...flaggedTopics]);

    } catch (e) {
      console.error('Failed to load admin data', e);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const handleUpdateReportStatus = async (reportId: string, status: 'resolved' | 'dismissed') => {
    if (status === 'resolved') {
        const success = await db.deleteReport(reportId);
        if (success) {
            setReports(prev => prev.filter(r => r.id !== reportId));
        }
    } else {
        const success = await db.updateReportStatus(reportId, status);
        if (success) {
          setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
        }
    }
  };

  const handleDeleteItem = async (type: string, id: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить этот ${type}?`)) return;
    
    let success = false;
    if (type === 'topic') success = await db.deleteTopic(id);
    else if (type === 'comment') success = await db.deleteComment(id);
    else if (type === 'review') success = await db.deleteReview(id);

    if (success) {
      alert('Успешно удалено');
      loadAdminData(); // Reload data
    } else {
      alert('Ошибка при удалении');
    }
  };

  const handleUpdateUser = async (email: string, action: 'ban' | 'mute') => {
    const emailToUpdate = prompt(`Введите email пользователя для ${action === 'ban' ? 'бана' : 'мута'}:`, email);
    if (!emailToUpdate) return;

    const daysStr = prompt(`На сколько дней ${action === 'ban' ? 'забанить' : 'замутить'}? (Оставьте пустым для навсегда)`, "7");
    let untilDate: string | undefined = undefined;
    
    if (daysStr && !isNaN(parseInt(daysStr))) {
        const days = parseInt(daysStr);
        const date = new Date();
        date.setDate(date.getDate() + days);
        untilDate = date.toISOString();
    }

    const updates: any = action === 'ban' 
        ? { isBanned: true, bannedUntil: untilDate } 
        : { isMuted: true, mutedUntil: untilDate };
        
    const success = await db.updateUserStatus(emailToUpdate, updates);
    if (success) {
      alert(`Пользователь ${emailToUpdate} успешно ${action === 'ban' ? 'забанен' : 'замучен'}${untilDate ? ` до ${new Date(untilDate).toLocaleDateString()}` : ' навсегда'}`);
    } else {
      alert('Ошибка при обновлении статуса пользователя');
    }
  };

  const handleAddDmcaBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDmcaId.trim()) return;
    
    // Extract ID if it's a URL
    let idToAdd = newDmcaId.trim();
    if (idToAdd.includes('shikimori.one/animes/') || idToAdd.includes('/anime/')) {
      const parts = idToAdd.split('/');
      const lastPart = parts[parts.length - 1];
      idToAdd = lastPart.split('-')[0];
    } else if (!/^[a-z]?\d+$/i.test(idToAdd)) {
      alert('Пожалуйста, введите корректный ID или ссылку на Shikimori');
      return;
    }

    const success = await db.addDmcaBlock(idToAdd);
    if (success) {
      setDmcaBlocks(prev => [...prev, idToAdd]);
      setNewDmcaId('');
      alert('Аниме успешно заблокировано');
    } else {
      alert('Ошибка при блокировке. Возможно, ID уже в списке.');
    }
  };

  const handleRemoveDmcaBlock = async (id: string) => {
    if (!window.confirm(`Разблокировать аниме с ID ${id}?`)) return;
    const success = await db.removeDmcaBlock(id);
    if (success) {
      setDmcaBlocks(prev => prev.filter(b => b !== id));
    } else {
      alert('Ошибка при разблокировке');
    }
  };

  const handleAddSlugBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlugId.trim()) return;
    
    // Extract ID if it's a URL
    let idToAdd = newSlugId.trim();
    if (idToAdd.includes('shikimori.one/animes/') || idToAdd.includes('/anime/')) {
      const parts = idToAdd.split('/');
      const lastPart = parts[parts.length - 1];
      idToAdd = lastPart.split('-')[0];
    } else if (!/^[a-z]?\d+$/i.test(idToAdd)) {
      alert('Пожалуйста, введите корректный ID или ссылку на Shikimori');
      return;
    }

    const success = await db.addSlugBlock(idToAdd);
    if (success) {
      setSlugBlocks(prev => [...prev, idToAdd]);
      setNewSlugId('');
    } else {
      alert('Ошибка при добавлении блокировки');
    }
  };

  const handleRemoveSlugBlock = async (id: string) => {
    if (!window.confirm(`Удалить блокировку слага для аниме с ID ${id}?`)) return;
    const success = await db.removeSlugBlock(id);
    if (success) {
      setSlugBlocks(prev => prev.filter(b => b !== id));
    } else {
      alert('Ошибка при удалении блокировки');
    }
  };

  if (user?.role !== 'admin' && user?.role !== 'moderator') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Shield className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Доступ запрещен</h1>
        <p className="text-gray-400">У вас нет прав для просмотра этой страницы.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-8 h-8 text-indigo-500" />
        <h1 className="text-3xl font-bold text-white">Панель управления</h1>
      </div>

      <div className="flex gap-4 mb-6 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'reports' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Жалобы ({reports.filter(r => r.status === 'pending').length})
        </button>
        <button
          onClick={() => setActiveTab('profanity')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'profanity' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Фильтр мата ({profaneContent.length})
        </button>
        <button
          onClick={() => setActiveTab('dmca')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'dmca' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Блокировки (DMCA)
        </button>
        <button
          onClick={() => setActiveTab('slug')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'slug' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Скрытие слага
        </button>
        {user?.role === 'admin' && (
          <>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'users' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Пользователи ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('seo')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'seo' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileText className="w-4 h-4" />
              SEO Генератор
            </button>
            <button
              onClick={() => setActiveTab('bot')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'bot' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Send className="w-4 h-4" />
              Настройка ТГ-Бота
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <>
          <div style={{ display: activeTab === 'reports' ? 'block' : 'none' }}>
            <div className="space-y-4">
              {reports.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Нет активных жалоб</p>
              ) : (
                reports.map(report => (
                  <div key={report.id} className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium mb-2 ${
                          report.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          report.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {report.status === 'pending' ? 'Ожидает' : report.status === 'resolved' ? 'Решено' : 'Отклонено'}
                        </span>
                        <h3 className="text-lg font-semibold text-white">
                          Жалоба на {report.targetLink ? (
                            <Link to={report.targetLink} className="text-indigo-400 hover:underline">{translateType(report.targetType)}</Link>
                          ) : report.targetType === 'topic' ? (
                            <Link to={`/forum/${report.targetId}`} className="text-indigo-400 hover:underline">{translateType(report.targetType)}</Link>
                          ) : report.targetType === 'user' ? (
                            <Link to={`/user/${report.targetId}`} className="text-indigo-400 hover:underline">{translateType(report.targetType)}</Link>
                          ) : (
                            translateType(report.targetType)
                          )}
                          <span className="text-sm text-gray-500 ml-2">({report.targetId})</span>
                        </h3>
                        <p className="text-sm text-gray-400">От: {report.reporterName || report.reporterId} | Дата: {new Date(report.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        {report.status === 'pending' && (
                          <>
                            <button onClick={() => handleUpdateReportStatus(report.id, 'resolved')} className="p-2 bg-green-500/10 text-green-400 rounded-lg hover:bg-green-500/20 transition-colors" title="Отметить как решенное">
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleUpdateReportStatus(report.id, 'dismissed')} className="p-2 bg-gray-500/10 text-gray-400 rounded-lg hover:bg-gray-500/20 transition-colors" title="Отклонить">
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="bg-black/20 p-4 rounded-lg mb-4">
                      {report.targetContent && (
                        <div className="mb-3 pb-3 border-b border-white/5">
                          <p className="text-sm text-gray-400 mb-1">Содержимое:</p>
                          <p className="text-white italic">"{report.targetContent}"</p>
                        </div>
                      )}
                      <p className="text-gray-300"><span className="font-semibold text-white">Причина:</span> {report.reason}</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleDeleteItem(report.targetType, report.targetId)} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm">
                        <Trash2 className="w-4 h-4" /> Удалить контент
                      </button>
                      {report.targetType === 'user' && (
                        <>
                          <button onClick={() => handleUpdateUser(report.targetId, 'ban')} className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-colors text-sm">
                            <UserX className="w-4 h-4" /> Забанить
                          </button>
                          <button onClick={() => handleUpdateUser(report.targetId, 'mute')} className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 transition-colors text-sm">
                            <MessageSquareOff className="w-4 h-4" /> Замутить
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: activeTab === 'profanity' ? 'block' : 'none' }}>
            <div className="space-y-4">
              {profaneContent.length === 0 ? (
                <p className="text-gray-400 text-center py-8">Подозрительный контент не найден</p>
              ) : (
                profaneContent.map((item, idx) => (
                  <div key={idx} className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-yellow-500" />
                      <span className="text-sm font-medium text-gray-400 uppercase">{item.type}</span>
                    </div>
                    <p className="text-white mb-2">{item.content}</p>
                    <p className="text-sm text-gray-500 mb-4">Автор: {item.author}</p>
                    <button onClick={() => handleDeleteItem(item.type, item.id)} className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors text-sm">
                      <Trash2 className="w-4 h-4" /> Удалить
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: activeTab === 'dmca' ? 'block' : 'none' }}>
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Добавить блокировку (DMCA)</h2>
                <form onSubmit={handleAddDmcaBlock} className="flex gap-4">
                  <input
                    type="text"
                    value={newDmcaId}
                    onChange={(e) => setNewDmcaId(e.target.value)}
                    placeholder="ID аниме на Shikimori или ссылка (например, https://shikimori.one/animes/12345)"
                    className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!newDmcaId.trim()}
                    className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Заблокировать
                  </button>
                </form>
                <p className="text-sm text-gray-400 mt-2">
                  При добавлении аниме в этот список, плеер на странице этого аниме будет заменен на заглушку "Удалено по требованию правообладателя".
                </p>
              </div>

              <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Заблокированные аниме ({dmcaBlocks.length})</h2>
                {dmcaBlocks.length === 0 ? (
                  <p className="text-gray-400">Список пуст</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dmcaBlocks.map(id => (
                      <div key={id} className="bg-slate-900/50 border border-white/10 rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <span className="text-gray-400 text-sm">ID:</span>
                          <span className="text-white font-mono ml-2">{id}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveDmcaBlock(id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Разблокировать"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: activeTab === 'slug' ? 'block' : 'none' }}>
            <div className="space-y-6">
              <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Скрыть слаг (английское название) из URL</h2>
                <p className="text-gray-400 mb-4 text-sm">
                  Добавьте ID аниме, чтобы оно открывалось только по короткой ссылке (например, /anime/12345). 
                  Старая ссылка с названием будет заблокирована.
                </p>
                <form onSubmit={handleAddSlugBlock} className="flex gap-4">
                  <input
                    type="text"
                    value={newSlugId}
                    onChange={(e) => setNewSlugId(e.target.value)}
                    placeholder="ID аниме на Shikimori или ссылка"
                    className="flex-1 bg-slate-900/50 border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Скрыть
                  </button>
                </form>
              </div>

              <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                <h2 className="text-xl font-bold text-white mb-4">Скрытые слоги ({slugBlocks.length})</h2>
                {slugBlocks.length === 0 ? (
                  <p className="text-gray-400">Список пуст</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {slugBlocks.map(id => (
                      <div key={id} className="bg-slate-900/50 border border-white/5 rounded-lg p-4 flex items-center justify-between group">
                        <span className="text-white font-mono">{id}</span>
                        <button
                          onClick={() => handleRemoveSlugBlock(id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {user?.role === 'admin' && (
            <>
              <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
                <div className="space-y-4">
                  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Управление пользователями</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-gray-400 text-sm">
                            <th className="pb-3 font-medium">Пользователь</th>
                            <th className="pb-3 font-medium">Email</th>
                            <th className="pb-3 font-medium">Роль</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {users.map(u => (
                            <tr key={u.id} className="hover:bg-white/5 transition-colors">
                              <td className="py-4">
                                <div className="flex items-center gap-3">
                                  <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full bg-slate-800" />
                                  <span className="text-white font-medium">{u.name}</span>
                                </div>
                              </td>
                              <td className="py-4 text-gray-400">{u.email}</td>
                              <td className="py-4">
                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                  u.role === 'admin' ? 'bg-red-500/20 text-red-400' :
                                  u.role === 'moderator' ? 'bg-blue-500/20 text-blue-400' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {u.role || 'user'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: activeTab === 'seo' ? 'block' : 'none' }}>
                <AdminSeoPanel />
              </div>

              <div style={{ display: activeTab === 'bot' ? 'block' : 'none' }}>
                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                    <h2 className="text-2xl font-black text-white mb-2 flex items-center gap-3">
                      <Send className="w-6 h-6 text-indigo-400" /> Интеграция Telegram-Бота для скачивания серий
                    </h2>
                    <p className="text-gray-400 text-sm">
                      Вы можете настроить вашего текущего Telegram-бота на поддержку функции скачивания серий. Бот будет автоматически получать команду при клике на вашем сайте, запрашивать качество трансляции и отправлять готовую ссылку или файл пользователю.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 space-y-4">
                      <h3 className="text-lg font-bold text-white">📋 Инструкция по быстрой настройке</h3>
                      <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
                        <li>
                          <span className="font-semibold text-white">Используйте вашего бота</span>: 
                          Используйте токен от бота, который вы ранее создавали у <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">@BotFather</a>.
                        </li>
                        <li>
                          <span className="font-semibold text-white">Создайте Space на Hugging Face</span>:
                          Зарегистрируйтесь на <a href="https://huggingface.co" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Hugging Face</a>, нажмите <span className="text-white">"New Space"</span>, выберите SDK: <span className="text-indigo-400 font-bold">Gradio</span> (это самый простой вариант, работающий на Python).
                        </li>
                        <li>
                          <span className="font-semibold text-white">ДОБАВЬТЕ ФАЙЛ app.py (Критично!)</span>:
                          В репозитории созданного Space создайте новый файл с именем <span className="text-emerald-400 font-bold font-mono">app.py</span>. Скопируйте туда код скрипта снизу и сохраните. <span className="text-amber-400 font-medium">Именно это решает проблему «нету app file».</span>
                        </li>
                        <li>
                          <span className="font-semibold text-white">Добавьте requirements.txt</span>:
                          Создайте второй файл с именем <span className="text-pink-400 font-bold font-mono">requirements.txt</span> и напишите туда следующие три строки (это исправит несовместимость версий):
                          <pre className="bg-slate-900 border border-white/5 p-2 rounded text-xs text-indigo-300 mt-1 font-mono">
python-telegram-bot{"\n"}
gradio{"\n"}
huggingface_hub&lt;=0.24.0
                          </pre>
                        </li>
                        <li>
                          <span className="font-semibold text-white">Добавьте Secrets</span>:
                          В настройках вашего Space перейдите в раздел <span className="text-white">Settings &gt; Repository Secrets</span> и добавьте переменную <code className="bg-slate-900 px-1 py-0.5 rounded text-rose-400">TELEGRAM_BOT_TOKEN</code> со значением вашего токена от BotFather.
                          <div className="mt-2 text-rose-400 font-medium bg-rose-950/20 border border-rose-500/20 p-2.5 rounded-lg text-xs leading-relaxed">
                            🛑 <strong>КРИТИЧЕСКИ ВАЖНО:</strong> Никогда не создавайте секреты или переменные с именами <code className="bg-slate-950 px-1 text-rose-300 font-mono">SPACE_ID</code> или <code className="bg-slate-950 px-1 text-rose-300 font-mono">SPACE_HOST</code>! Они определяются платформой Hugging Face автоматически. Если вы их уже вручную добавили — <strong>немедленно удалите их</strong> в настройках Space, иначе возникнет ошибка <i>Reserved environment variables: ["SPACE_ID"]</i> и Space заблокируется!
                          </div>
                        </li>
                        <li className="text-amber-300 font-medium">
                          ⚠️ <span className="font-semibold text-white">Решение ошибки "Timed out / ConnectTimeout"</span>:
                          Telegram блокирует запросы с IP-адресов Hugging Face. Чтобы бот заработал, добавьте еще одну переменную в <span className="text-white">Settings &gt; Repository Secrets</span>:
                          <ul className="list-disc list-inside space-y-2 pl-4 mt-2 text-slate-300">
                            <li>Имя: <code className="bg-slate-900 px-1 py-0.5 rounded text-emerald-400 font-mono">TELEGRAM_BASE_URL</code></li>
                            <li>
                              Значение (выберите любой рабочий прокси/зеркало):
                              <div className="bg-slate-900/80 border border-white/5 p-3 rounded-lg mt-1 space-y-1.5 font-mono text-xs text-indigo-300">
                                <div>• <code className="text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded">https://tapi.bitti.io/bot</code> (Стабильное публичное зеркало)</div>
                                <div>• <code className="text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded">https://telegg.ru/bot</code> (Российское зеркало для обхода блокировок)</div>
                                <div>• <code className="text-emerald-400 bg-emerald-950/40 px-1 py-0.5 rounded">https://api.telegram-proxy.org/bot</code> (Популярный прокси-сервер)</div>
                              </div>
                            </li>
                            <li className="text-xs text-slate-400 mt-2">
                              🛡️ **Самый надежный способ (свой прокси за 1 минуту бесплатно):**
                              <div className="mt-1 pl-2 border-l-2 border-slate-700 space-y-1 text-slate-300 text-[11px] leading-relaxed">
                                1. Зайдите на <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">Cloudflare</a> &gt; Workers &amp; Pages &gt; Create Worker.<br />
                                2. Вставьте в код воркера эти 6 строчек:<br />
                                <pre className="bg-slate-950 p-1.5 rounded text-[10px] text-pink-400 font-mono my-1 leading-normal">
{`export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'api.telegram.org';
    return fetch(new Request(url, request));
  }
}`}
                                </pre>
                                3. Нажмите **Deploy** и скопируйте вашу личную ссылку (например, <code className="text-amber-400">https://my-tg-proxy.myname.workers.dev/bot</code>). Вставьте её в секреты Hugging Face!
                              </div>
                            </li>
                          </ul>
                        </li>
                      </ol>
                    </div>

                    <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-white mb-2">🚀 Преимущества запуска</h3>
                        <div className="space-y-4 text-sm text-gray-300">
                          <p>
                            Использование облачной инфраструктуры позволяет автоматизировать подготовку файлов:
                          </p>
                          <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
                            <li><span className="text-green-400 font-bold">Работа 24/7 абсолютно бесплатно</span></li>
                            <li>Высокая скорость обработки медиаданных без нагрузки на ваш сервер</li>
                            <li>Надежное шифрование и скрытие ваших токенов внутри настроек Secrets</li>
                            <li>Удобная интеграция старт-параметров с кнопкой с сайта</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <p className="text-xs text-indigo-300 leading-relaxed font-medium">
                          💡 Переменная <code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-300">VITE_TELEGRAM_BOT_USERNAME</code> в вашем <code className="bg-slate-900 px-1 px-0.5 rounded text-emerald-300">.env</code> связывает кнопку скачивания с вашим ботом.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-white">🐍 Исходный код Python-скрипта (для app.py)</h3>
                      <button
                        onClick={() => {
                          const customScript = PYTHON_BOT_SCRIPT.replace(/WEB_BASE_URL_PLACEHOLDER/g, window.location.origin);
                          navigator.clipboard.writeText(customScript);
                          alert('Код скопирован в буфер обмена!');
                        }}
                        className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" /> Скопировать код app.py
                      </button>
                    </div>
                    <p className="text-sm text-gray-400 mb-4">
                      Создайте в вашем Space файл с именем <code className="bg-slate-900 px-1.5 py-0.5 rounded text-pink-400 font-mono">app.py</code> и вставьте этот код:
                    </p>
                    <pre className="max-h-[350px] overflow-y-auto bg-slate-900/80 rounded-xl p-4 font-mono text-xs text-gray-300 border border-white/5 whitespace-pre select-all">
                      {PYTHON_BOT_SCRIPT.replace(/WEB_BASE_URL_PLACEHOLDER/g, typeof window !== 'undefined' ? window.location.origin : '')}
                    </pre>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AdminPanel;
