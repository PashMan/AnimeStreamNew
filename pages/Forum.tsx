import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link, useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Plus, User, Clock, ChevronRight, ArrowLeft, Loader2, MessageCircle, Eye, Hash, Send, Reply, AlertTriangle, Trash2 } from 'lucide-react';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { ForumTopic, ForumPost, Anime } from '../types';
import { fetchAnimeDetails, fetchNews } from '../services/shikimori';
import { FALLBACK_IMAGE } from '../constants';
import { RichTextarea } from '../components/RichTextarea';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import SEO from '../components/SEO';
import { ReportModal } from '../components/ReportModal';
import { useSlugBlocks } from '../store/slugBlocks';
import { useDmcaBlocks } from '../store/dmcaBlocks';
import { filterProfanity } from '../utils/profanity';

const CATEGORIES = [
  { id: 'general', name: 'Общее', description: 'Общие обсуждения на любые темы' },
  { id: 'anime', name: 'Аниме', description: 'Обсуждение аниме, персонажей и сюжетов' },
  { id: 'offtopic', name: 'Оффтоп', description: 'Разговоры обо всем на свете' },
  { id: 'support', name: 'Поддержка', description: 'Вопросы, предложения и баги' },
];

const Forum: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { topicId } = useParams<{ topicId: string }>();
  const animeIdParam = searchParams.get('animeId');
  const categoryParam = searchParams.get('category');
  
  const { user, openAuthModal } = useAuth();
  const navigate = useNavigate();
  const { slugBlocks } = useSlugBlocks();
  const { dmcaBlocks } = useDmcaBlocks();
  
  // List State
  const [topics, setTopics] = useState<ForumTopic[]>([]);
  const [anime, setAnime] = useState<Anime | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(categoryParam || 'all');
  
  // Detail State
  const [currentTopic, setCurrentTopic] = useState<ForumTopic | null>(null);
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [replyContent, setReplyContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<ForumPost | null>(null);
  
  // Create State
  const [isCreating, setIsCreating] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [newTopicContent, setNewTopicContent] = useState('');
  const [newTopicCategory, setNewTopicCategory] = useState('general');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [topicOffset, setTopicOffset] = useState(0);
  const [hasMoreTopics, setHasMoreTopics] = useState(true);
  const TOPICS_LIMIT = 20;

  // Report State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{type: 'topic' | 'post', id: string, content?: string, link?: string} | null>(null);

  // Load Topic List
  useEffect(() => {
    if (topicId) return; // Skip if viewing detail
    
    const loadList = async () => {
      setIsLoading(true);
      setTopicOffset(0);
      setHasMoreTopics(true);
      try {
        const [topicsData, animeData] = await Promise.all([
          db.getForumTopics(animeIdParam || undefined, activeCategory !== 'all' ? activeCategory : undefined, TOPICS_LIMIT, undefined, 0),
          animeIdParam ? fetchAnimeDetails(animeIdParam) : Promise.resolve(null)
        ]);

        // Merge and sort
        const allTopics = [...topicsData].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setTopics(allTopics);
        setHasMoreTopics(topicsData.length >= TOPICS_LIMIT);
        setAnime(animeData);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadList();
  }, [animeIdParam, activeCategory, topicId]);

  const loadMoreTopics = async () => {
      if (isLoading || !hasMoreTopics) return;
      setIsLoading(true);
      const nextOffset = topicOffset + TOPICS_LIMIT;
      try {
          const topicsData = await db.getForumTopics(animeIdParam || undefined, activeCategory !== 'all' ? activeCategory : undefined, TOPICS_LIMIT, undefined, nextOffset);
          if (topicsData.length > 0) {
              setTopics(prev => [...prev, ...topicsData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
              setTopicOffset(nextOffset);
              setHasMoreTopics(topicsData.length >= TOPICS_LIMIT);
          } else {
              setHasMoreTopics(false);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsLoading(false);
      }
  };

  // Load Topic Detail
  useEffect(() => {
    if (!topicId) return;

    const loadDetail = async () => {
      setIsLoading(true);
      try {
        // Handle DB Topic Detail
        const [topic, topicPosts] = await Promise.all([
          db.getForumTopic(topicId),
          db.getForumPosts(topicId)
        ]);
        setCurrentTopic(topic);
        setPosts(topicPosts);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadDetail();
  }, [topicId]);

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { openAuthModal(); return; }
    if (!newTopicTitle.trim() || !newTopicContent.trim()) return;
    
    setIsActionLoading(true);
    try {
      const topic = await db.createForumTopic({
        title: newTopicTitle,
        content: newTopicContent,
        author: user.email,
        animeId: animeIdParam || undefined,
        category: animeIdParam ? 'anime' : newTopicCategory
      });
      
      if (topic) {
        setNewTopicTitle('');
        setNewTopicContent('');
        setIsCreating(false);
        // If we are on list view, refresh or navigate
        if (!topicId) {
            setTopics([topic, ...topics]);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Произошла ошибка при создании темы');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) { openAuthModal(); return; }
    if (!replyContent.trim() || !currentTopic) return;

    setIsActionLoading(true);
    try {
      const targetTopicId = currentTopic.id;
      
      // YouTube style: all replies group under the top-level comment
      // If we are replying to a reply, use its parentId as our parentId
      const parentId = replyingTo ? (replyingTo.parentId || replyingTo.id) : undefined;
      
      const post = await db.createForumPost({
        topicId: targetTopicId,
        content: replyContent,
        author: user.email,
        parentId: parentId
      });
      
      if (post) {
        setPosts([...posts, post]);
        setReplyContent('');
        setReplyingTo(null);
        // Update reply count locally
        setCurrentTopic(prev => prev ? ({...prev, repliesCount: prev.repliesCount + 1}) : null);
      }
    } catch (err: any) {
        alert(err.message || 'Произошла ошибка при отправке сообщения');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReplyToUser = (post: ForumPost) => {
      setReplyingTo(post);
      const mention = `**${post.author.name}**, `;
      setReplyContent(mention);
      // Focus textarea
      const textarea = document.querySelector('textarea[name="replyContent"]') as HTMLTextAreaElement;
      if (textarea) {
          textarea.focus();
      }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>;

  // --- TOPIC DETAIL VIEW ---
  if (topicId && currentTopic) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-in fade-in duration-500">
        <SEO 
          title={currentTopic.title} 
          description={currentTopic.content.slice(0, 160)}
          type="article"
        />
        <style>{`
          .news-content img {
              max-width: 100%;
              height: auto;
              border-radius: 1rem;
              margin: 1.5rem 0;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
              display: block;
              border: 1px solid rgba(255, 255, 255, 0.05);
          }
          .news-content iframe {
              width: 100%;
              aspect-ratio: 16/9;
              border-radius: 1rem;
              margin: 1.5rem 0;
              border: 0;
              box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
          }
          .news-content a {
              color: #8B5CF6;
              text-decoration: none;
              font-weight: 700;
              transition: color 0.2s;
          }
          .news-content a:hover {
              color: #fff;
              text-decoration: underline;
          }
          /* Markdown Styles */
          .markdown-body p { margin-bottom: 1em; }
          .markdown-body strong { font-weight: 900; color: white; }
          .markdown-body em { font-style: italic; color: #cbd5e1; }
          .markdown-body blockquote { border-left: 4px solid #8B5CF6; padding-left: 1rem; margin: 1rem 0; color: #94a3b8; font-style: italic; }
          .markdown-body u { text-decoration: underline; text-decoration-color: #8B5CF6; text-underline-offset: 4px; }
        `}</style>
        <div className="mb-8">
          <Link to="/forum" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> Назад к списку
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[10px] font-black uppercase tracking-widest">
              {CATEGORIES.find(c => c.id === currentTopic.category)?.name || currentTopic.category}
            </span>
            <span className="text-slate-500 text-xs font-bold flex items-center gap-1">
               <Clock className="w-3 h-3" /> {new Date(currentTopic.createdAt).toLocaleDateString('ru-RU')}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-black text-white uppercase tracking-tight leading-tight mb-6">
            {filterProfanity(currentTopic.title)}
          </h1>
        </div>

        <div className="space-y-8">
          {/* Original Post */}
          <div className="bg-surface/30 border border-white/5 rounded-[2rem] p-8 md:p-10 relative overflow-hidden">
             <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-6">
                <Link to={`/user/${currentTopic.author.id || currentTopic.author.email}`} className="shrink-0">
                   <img src={currentTopic.author.avatar || '/api/image/assets/fallback/user/avatar/x96.png'} loading="lazy" className="w-12 h-12 rounded-xl object-cover shadow-md ring-2 ring-white/5" alt="" />
                </Link>
                <div>
                   <Link to={`/user/${currentTopic.author.id || currentTopic.author.email}`} className="font-black text-white text-base hover:text-primary transition-colors">{currentTopic.author.name}</Link>
                   <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Автор темы</div>
                </div>
             </div>
             
             <div className="min-w-0 overflow-hidden">
                {currentTopic.category === 'news' ? (
                    <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed news-content break-words" dangerouslySetInnerHTML={{ __html: currentTopic.content }} />
                ) : (
                    <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed whitespace-pre-wrap break-words markdown-body">
                       <ReactMarkdown 
                         rehypePlugins={[rehypeRaw]}
                         remarkPlugins={[remarkGfm]}
                         components={{
                             u: ({node, ...props}: any) => <u {...props} />,
                             img: ({node, ...props}: any) => (
                                 <img 
                                     {...props} 
                                     className="max-w-full rounded-2xl my-4 shadow-lg border border-white/10 object-contain max-h-[500px]" 
                                     loading="lazy" 
                                     alt={props.alt || "Изображение"} 
                                 />
                             )
                         }}
                       >
                           {filterProfanity(currentTopic.content)}
                       </ReactMarkdown>
                    </div>
                )}
                <div className="mt-6 flex items-center gap-4 border-t border-white/5 pt-4">
                  <button
                    onClick={() => {
                      setReportTarget({ 
                        type: 'topic', 
                        id: currentTopic.id, 
                        content: currentTopic.title,
                        link: window.location.pathname + window.location.search
                      });
                      setIsReportModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <AlertTriangle className="w-3 h-3" /> Пожаловаться
                  </button>
                  {user && (user.role === 'admin' || user.role === 'moderator') && (
                    <button
                      onClick={async () => {
                        if (window.confirm('Удалить тему?')) {
                          await db.deleteForumTopic(currentTopic.id);
                          navigate('/forum');
                        }
                      }}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Удалить
                    </button>
                  )}
                </div>
             </div>
          </div>

          {/* Replies */}
          <div className="space-y-6">
             <h3 className="text-xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
               <MessageCircle className="w-5 h-5 text-primary" /> Ответы ({posts.length})
             </h3>
             
             <div className="space-y-6">
                {posts.filter(p => !p.parentId).map(post => {
                  // Find all replies that belong to this thread
                  // In YouTube style, all replies to a root post are grouped together
                  // We find direct replies and replies to those replies if they share the same root parentId
                  // With our new logic, all replies in a thread will have the root post's ID as parentId
                  const threadReplies = posts.filter(r => r.parentId === post.id);
                  
                  return (
                    <div key={post.id} className="space-y-4">
                      <div className="bg-surface/20 border border-white/5 rounded-[2rem] p-6 md:p-8 group">
                        <div className="flex items-center gap-4 mb-4 border-b border-white/5 pb-4">
                           <Link to={`/user/${post.author.id || post.author.email}`} className="shrink-0">
                               <img src={post.author.avatar} loading="lazy" className="w-10 h-10 rounded-xl object-cover shadow-md" alt="" />
                           </Link>
                           <div>
                              <Link to={`/user/${post.author.id || post.author.email}`} className="font-bold text-white text-xs hover:text-primary transition-colors">{post.author.name}</Link>
                              <div className="text-[9px] text-slate-500 uppercase tracking-widest">{new Date(post.createdAt).toLocaleDateString()}</div>
                           </div>
                        </div>
                        
                        <div className="min-w-0">
                           <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap break-words markdown-body">
                              <ReactMarkdown
                                rehypePlugins={[rehypeRaw]}
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    u: ({node, ...props}: any) => <u {...props} />,
                                    img: ({node, ...props}: any) => (
                                        <img 
                                            {...props} 
                                            className="max-w-full rounded-2xl my-4 shadow-lg border border-white/10 object-contain max-h-[500px]" 
                                            loading="lazy" 
                                            alt={props.alt || "Изображение"} 
                                        />
                                    )
                                }}
                              >
                                  {filterProfanity(post.content)}
                              </ReactMarkdown>
                           </div>
                           <div className="mt-4 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={() => handleReplyToUser(post)}
                               className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors"
                             >
                                 <Reply className="w-3 h-3" /> Ответить
                             </button>
                             <button
                               onClick={() => {
                                 setReportTarget({ 
                                   type: 'post', 
                                   id: post.id, 
                                   content: filterProfanity(post.content),
                                   link: window.location.pathname + window.location.search
                                 });
                                 setIsReportModalOpen(true);
                               }}
                               className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                             >
                               <AlertTriangle className="w-3 h-3" /> Пожаловаться
                             </button>
                             {user && (user.role === 'admin' || user.role === 'moderator') && (
                               <button
                                 onClick={async () => {
                                   if (window.confirm('Удалить комментарий?')) {
                                     await db.deleteForumPost(post.id);
                                     setPosts(posts.filter(p => p.id !== post.id));
                                   }
                                 }}
                                 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                               >
                                 <Trash2 className="w-3 h-3" /> Удалить
                               </button>
                             )}
                           </div>
                        </div>
                      </div>

                      {/* Nested Replies */}
                      {threadReplies.length > 0 && (
                        <div className="ml-8 md:ml-16 space-y-4 border-l-2 border-white/5 pl-4 md:pl-8">
                          {threadReplies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(reply => (
                            <div key={reply.id} className="bg-surface/10 border border-white/5 rounded-[1.5rem] p-4 md:p-6 group">
                              <div className="flex items-center gap-3 mb-3 border-b border-white/5 pb-3">
                                <Link to={`/user/${reply.author.id || reply.author.email}`} className="shrink-0">
                                    <img src={reply.author.avatar} loading="lazy" className="w-8 h-8 rounded-lg object-cover shadow-md" alt="" />
                                </Link>
                                <div>
                                  <Link to={`/user/${reply.author.id || reply.author.email}`} className="font-bold text-white text-[10px] hover:text-primary transition-colors">{reply.author.name}</Link>
                                  <div className="text-[8px] text-slate-500 uppercase tracking-widest">{new Date(reply.createdAt).toLocaleDateString()}</div>
                                </div>
                              </div>
                              <div className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap break-words markdown-body">
                                <ReactMarkdown
                                  rehypePlugins={[rehypeRaw]}
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                      u: ({node, ...props}: any) => <u {...props} />,
                                      img: ({node, ...props}: any) => (
                                          <img 
                                              {...props} 
                                              className="max-w-full rounded-2xl my-4 shadow-lg border border-white/10 object-contain max-h-[500px]" 
                                              loading="lazy" 
                                              alt={props.alt || "Изображение"} 
                                          />
                                      )
                                  }}
                                >
                                    {filterProfanity(reply.content)}
                                </ReactMarkdown>
                              </div>
                              <div className="mt-3 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => handleReplyToUser(reply)}
                                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors"
                                >
                                    <Reply className="w-3 h-3" /> Ответить
                                </button>
                                <button
                                  onClick={() => {
                                    setReportTarget({ 
                                      type: 'post', 
                                      id: reply.id, 
                                      content: filterProfanity(reply.content),
                                      link: window.location.pathname + window.location.search
                                    });
                                    setIsReportModalOpen(true);
                                  }}
                                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                </button>
                                {user && (user.role === 'admin' || user.role === 'moderator') && (
                                  <button
                                    onClick={async () => {
                                      if (window.confirm('Удалить комментарий?')) {
                                        await db.deleteForumPost(reply.id);
                                        setPosts(posts.filter(p => p.id !== reply.id));
                                      }
                                    }}
                                    className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
             </div>
          </div>

          {/* Reply Form */}
          <div className="bg-surface/30 border border-white/5 rounded-[2.5rem] p-8 mt-12">
             <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-white uppercase tracking-widest">
                  {replyingTo ? `Ответ для ${replyingTo.author.name}` : 'Ваш ответ'}
                </h3>
                {replyingTo && (
                  <button onClick={() => setReplyingTo(null)} className="text-[10px] font-black uppercase text-red-400 hover:text-red-300 transition-colors">Отмена</button>
                )}
             </div>
             {user ? (
               <form onSubmit={handleReply} className="space-y-4">
                 <div className="flex gap-4">
                    <img src={user.avatar} loading="lazy" className="w-12 h-12 rounded-xl object-cover hidden md:block" alt="" />
                   <div className="flex-1">
                      <RichTextarea 
                        name="replyContent"
                        value={replyContent}
                        onChange={e => setReplyContent(e.target.value)}
                        placeholder="Напишите комментарий..."
                        className="min-h-[120px]"
                        onSubmit={() => handleReply()}
                      />
                   </div>
                 </div>
                 <div className="flex justify-end">
                    <button type="submit" disabled={isActionLoading || !replyContent.trim()} className="px-8 py-3 bg-primary text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-violet-600 transition-all flex items-center gap-2 disabled:opacity-50">
                       {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Отправить
                    </button>
                 </div>
               </form>
             ) : (
               <div className="text-center py-8">
                 <button onClick={openAuthModal} className="px-8 py-3 bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-white/10 transition-all">
                   Войдите, чтобы ответить
                 </button>
               </div>
             )}
          </div>
        </div>

        {isReportModalOpen && reportTarget && (
          <ReportModal
            isOpen={isReportModalOpen}
            targetId={reportTarget.id}
            targetType={reportTarget.type}
            targetContent={reportTarget.content}
            targetLink={reportTarget.link}
            onClose={() => {
              setIsReportModalOpen(false);
              setReportTarget(null);
            }}
          />
        )}
      </div>
    );
  }

  // --- TOPIC LIST VIEW ---
  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 py-10 min-h-screen pt-28 space-y-12 bg-[#141519]">
      <SEO 
        title="Форум сообщества" 
        description="Обсуждайте любимые аниме, делитесь мнениями и находите новых друзей на нашем форуме."
      />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 pb-6 border-b border-white/5">
        <div className="space-y-1.5">
          {anime ? (
            <div className="flex items-center gap-6 mb-4">
              <img 
                src={anime.image} 
                loading="lazy"
                className="w-20 h-28 object-cover rounded-xl shadow-lg" 
                alt={anime.title} 
                onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }}
              />
              <div>
                <h1 className="text-3xl md:text-4xl font-display font-black text-white uppercase tracking-tighter mb-2">
                  Форум: {anime.title}
                </h1>
                <Link to={dmcaBlocks.includes(anime.id.toString()) ? `/anime/${anime.id}-watch` : `/anime/${anime.id}${anime.slug && !slugBlocks.includes(anime.id.toString()) ? `-${anime.slug}` : ''}`} className="text-primary hover:text-white text-xs font-bold uppercase tracking-widest transition-colors">
                  Перейти к аниме
                </Link>
              </div>
            </div>
          ) : (
            <h1 className="text-3xl md:text-5xl font-display font-black text-white uppercase tracking-tight flex items-center gap-3">
              <span className="w-2 h-10 bg-primary rounded-full inline-block animate-pulse" />
              Форум сообщества
            </h1>
          )}
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mt-1.5">Делитесь мнениями, общайтесь и создавайте новые обсуждения</p>
        </div>
        
        <button 
          onClick={() => user ? setIsCreating(!isCreating) : openAuthModal()}
          className="px-8 py-4 bg-primary hover:bg-[#ff6e1a] hover:scale-[1.02] text-white font-black rounded-2xl flex items-center gap-3 transition-all active:scale-95 shadow-xl shadow-primary/20 uppercase text-[10px] tracking-widest shrink-0"
        >
          <Plus className="w-5 h-5 animate-pulse" /> Создать тему
        </button>
      </div>

      {/* Categories Navigation */}
      {!anime && (
        <div className="flex flex-wrap gap-2 mb-10">
          <button 
            onClick={() => setActiveCategory('all')} 
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === 'all' ? 'bg-white text-black' : 'bg-white/5 text-slate-400 hover:text-white'}`}
          >
            Все
          </button>
          {CATEGORIES.map(cat => (
            <button 
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)} 
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeCategory === cat.id ? 'bg-primary text-white' : 'bg-white/5 text-slate-400 hover:text-white'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {isCreating && (
        <div className="mb-12 bg-surface/30 border border-primary/20 rounded-[2.5rem] p-8 md:p-10 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-300">
          <form onSubmit={handleCreateTopic} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
               <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Заголовок темы</label>
                 <input 
                   type="text" 
                   value={newTopicTitle}
                   onChange={e => setNewTopicTitle(e.target.value)}
                   placeholder="О чем вы хотите поговорить?"
                   className="w-full h-14 px-6 bg-black/40 border border-white/10 rounded-2xl text-white focus:border-primary outline-none transition-all text-sm"
                 />
               </div>
               {!anime && (
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Категория</label>
                   <select 
                     value={newTopicCategory}
                     onChange={e => setNewTopicCategory(e.target.value)}
                     className="w-full h-14 px-6 bg-black/40 border border-white/10 rounded-2xl text-white focus:border-primary outline-none transition-all text-sm appearance-none cursor-pointer"
                   >
                     {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                   </select>
                 </div>
               )}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Содержание</label>
              <RichTextarea 
                value={newTopicContent}
                onChange={e => setNewTopicContent(e.target.value)}
                placeholder="Раскройте вашу мысль..."
                className="h-40"
              />
            </div>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setIsCreating(false)} className="px-8 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors">Отмена</button>
              <button type="submit" disabled={isActionLoading} className="px-10 py-4 bg-primary text-white font-black rounded-2xl uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                {isActionLoading ? 'Публикация...' : 'Опубликовать'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-4">
        {topics.length === 0 ? (
          <div className="text-center py-20 bg-surface/20 rounded-[3rem] border border-white/5">
            <MessageSquare className="w-16 h-16 text-slate-800 mx-auto mb-6" />
            <p className="text-slate-500 font-black uppercase tracking-widest text-xs">
              {activeCategory !== 'all' ? 'В этой категории пока нет тем.' : 'Тем пока нет. Будьте первым!'}
            </p>
          </div>
        ) : (
          topics.map(topic => (
            <Link to={`/forum/${topic.id}`} key={topic.id} className="group bg-surface/30 hover:bg-surface/50 border border-white/5 hover:border-primary/30 rounded-[2rem] p-6 md:p-8 transition-all cursor-pointer shadow-xl backdrop-blur-sm flex flex-col md:flex-row gap-6 items-start md:items-center overflow-hidden">
              <div className="flex-1 min-w-0 space-y-3 w-full">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-3 py-1 border rounded-lg text-[8px] font-black uppercase tracking-widest ${topic.category === 'news' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                    {CATEGORIES.find(c => c.id === topic.category)?.name || topic.category}
                  </span>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                    <User className="w-3 h-3" /> {topic.author.name}
                  </div>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                    <Clock className="w-3 h-3" /> {new Date(topic.createdAt).toLocaleDateString('ru-RU')}
                  </div>
                </div>
                <h3 className="text-lg md:text-xl font-black text-white group-hover:text-primary transition-colors uppercase tracking-tight leading-tight line-clamp-1">
                  {filterProfanity(topic.title)}
                </h3>
                <p className="text-slate-400 text-xs line-clamp-2">{filterProfanity(topic.content)}</p>
              </div>
              
              <div className="flex items-center gap-6 shrink-0 border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-6 w-full md:w-auto justify-between md:justify-end">
                 <div className="flex items-center gap-4">
                    <div className="text-center">
                       <div className="text-xs font-black text-white">{topic.repliesCount}</div>
                       <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Ответов</div>
                    </div>
                    <div className="text-center">
                       <div className="text-xs font-black text-white">{topic.views}</div>
                       <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Просмотров</div>
                    </div>
                 </div>
                 <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </div>
            </Link>
          ))
        )}
        
        {hasMoreTopics && topics.length > 0 && (
            <div className="mt-8 flex justify-center">
                <button 
                    onClick={loadMoreTopics}
                    disabled={isLoading}
                    className="px-8 py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Загрузить еще'}
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default Forum;
