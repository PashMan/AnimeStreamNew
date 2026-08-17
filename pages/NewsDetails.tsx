
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, ArrowLeft, Loader2, MessageSquare, PlayCircle, Reply } from 'lucide-react';
import { fetchNewsDetails, fetchAnimeVideos } from '../services/shikimori';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { NewsItem, Comment } from '../types';
import SEO from '../components/SEO';
import { RichTextarea } from '../components/RichTextarea';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { filterProfanity } from '../utils/profanity';

const NewsDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, openAuthModal } = useAuth();
  const [newsItem, setNewsItem] = useState<NewsItem | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userComment, setUserComment] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCommenting, setIsCommenting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      setIsLoading(true);
      try {
        const topicId = `news-${id}`;
        const [data, forumPosts] = await Promise.all([
          fetchNewsDetails(id),
          db.getForumPosts(topicId)
        ]);
        setNewsItem(data);
        
        const mappedComments: Comment[] = forumPosts.map(p => ({
            id: p.id,
            user: { name: p.author.name, avatar: p.author.avatar },
            text: p.content,
            date: new Date(p.createdAt).toLocaleDateString('ru-RU')
        }));
        setComments(mappedComments);

        // Fetch video asynchronously after news is loaded
        if (data && !data.video && data.linkedId) {
            fetchAnimeVideos(data.linkedId.toString()).then(videos => {
                const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
                const trailer = videos.find(v => v.url && (v.url.includes('youtube.com') || v.url.includes('youtu.be')));
                if (trailer) {
                    const vMatch = trailer.url.match(ytRegex);
                    if (vMatch) {
                        setNewsItem(prev => prev ? { ...prev, video: vMatch[1] } : prev);
                    }
                }
            }).catch(console.error);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { openAuthModal(); return; }
    if (!userComment.trim() || !newsItem) return;
    
    setIsCommenting(true);
    try {
      const topicId = `news-${id}`;
      
      // Check if topic exists in DB
      const existing = await db.getForumTopic(topicId);
      
      if (!existing) {
          // Create topic if it doesn't exist
          await db.createForumTopic({
              id: topicId,
              title: newsItem.title,
              content: newsItem.summary,
              author: user.email, 
              category: 'news',
              animeId: undefined
          });
      }

      const post = await db.createForumPost({
        topicId: topicId,
        content: userComment,
        author: user.email
      });

      if (post) {
          const newComment: Comment = {
              id: post.id,
              user: { name: user.name, avatar: user.avatar },
              text: post.content,
              date: new Date(post.createdAt).toLocaleDateString('ru-RU')
          };
          setComments([newComment, ...comments]); // Prepend new comment
          setUserComment('');
      }
    } catch (e) {
        console.error(e);
    } finally {
      setIsCommenting(false);
    }
  };

  const handleReplyToComment = (comment: Comment) => {
    if (!user) {
      openAuthModal();
      return;
    }
    const quote = `> **${comment.user.name}** писал(а):\n> ${comment.text.split('\n').join('\n> ')}\n\n`;
    setUserComment((prev) => prev ? `${prev}\n${quote}` : quote);
    
    // Scroll to textarea
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      textarea.focus();
    }
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 text-primary animate-spin" /></div>;
  if (!newsItem) return <div className="text-center py-20 text-slate-400 font-bold">Новость не найдена</div>;

  // Helper to ensure we have a valid YouTube embed URL
  const getEmbedUrl = (videoId: string) => {
    if (!videoId) return '';
    if (videoId.includes('youtube.com/embed/')) return videoId;
    
    if (videoId.includes('http') || videoId.includes('youtube.com') || videoId.includes('youtu.be')) {
        const idMatch = videoId.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        return idMatch ? `https://www.youtube.com/embed/${idMatch[1]}` : videoId;
    }
    return `https://www.youtube.com/embed/${videoId}`;
  };

  const videoUrl = newsItem.video ? getEmbedUrl(newsItem.video) : null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-8 lg:px-12 py-10 min-h-screen pt-28 bg-[#141519]">
      <SEO 
        title={newsItem.title} 
        description={newsItem.summary.replace(/<[^>]*>?/gm, '').slice(0, 160)}
        image={newsItem.image}
        type="article"
        keywords={`${newsItem.title}, аниме новости, ${newsItem.category}`}
      />
      <style>{`
        .news-content img {
            max-width: 100%;
            height: auto;
            border-radius: 1.5rem;
            margin: 2rem 0;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
            display: block;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .news-content iframe {
            width: 100%;
            aspect-ratio: 16/9;
            border-radius: 1.5rem;
            margin: 2rem 0;
            border: 0;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
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
        .news-content p {
            margin-bottom: 1.5rem;
        }
        .news-content span.text-primary {
            color: #8B5CF6;
        }
      `}</style>
      
      <Link to="/news" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-white transition-colors mb-8 group">
        <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" /> Вернуться к новостям
      </Link>

      <article className="bg-[#0b0b10] rounded-3xl border border-white/5 p-6 md:p-12 relative overflow-hidden shadow-2xl mb-16">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none -mr-40 -mt-40"></div>
        
        <header className="mb-10 relative z-10 border-b border-white/5 pb-8">
             <div className="flex items-center gap-4 text-sm mb-5">
                 <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded font-black uppercase tracking-wider text-[9px]">{newsItem.category}</span>
                 <span className="flex items-center gap-1.5 text-slate-500 font-bold uppercase tracking-wider text-[9px]"><Calendar className="w-3.5 h-3.5" /> {newsItem.date}</span>
             </div>
             <h1 className="text-2xl md:text-4xl font-display font-black text-white leading-tight uppercase tracking-tight">{newsItem.title}</h1>
        </header>

        <div className="relative z-10">
           {videoUrl ? (
             <div className="mb-12 w-full aspect-video bg-black rounded-[2rem] overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] border border-white/10 group relative">
                <iframe
                    src={videoUrl}
                    className="w-full h-full border-0"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    title="News Video"
                />
             </div>
           ) : newsItem.image && (
             <div className="mb-12 w-full aspect-video rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 relative group">
                <img src={newsItem.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-gradient-to-t from-dark/50 to-transparent"></div>
             </div>
           )}

           <div className="prose prose-invert prose-lg max-w-none text-slate-300 leading-relaxed font-medium text-lg news-content break-words whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: newsItem.html_body || newsItem.summary }} />
        </div>
      </article>

      <div className="mt-20">
        <div className="flex items-center gap-3 mb-10">
            <MessageSquare className="w-8 h-8 text-primary" />
            <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Обсуждение ({comments.length})</h3>
        </div>

        <div className="bg-surface/30 rounded-3xl p-8 border border-white/5 mb-10 shadow-xl backdrop-blur-sm">
            {user ? (
                <form onSubmit={handleAddComment} className="flex flex-col gap-6">
                    <div className="flex gap-4 items-start">
                        <img src={user.avatar} className="w-14 h-14 rounded-2xl object-cover ring-2 ring-white/5 hidden md:block" alt="" />
                        <div className="flex-1">
                            <RichTextarea 
                                value={userComment} 
                                onChange={(e) => setUserComment(e.target.value)} 
                                placeholder="Что вы думаете об этой новости?" 
                                className="min-h-[120px]" 
                                onSubmit={() => handleAddComment({ preventDefault: () => {} } as React.FormEvent)}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={isCommenting || !userComment.trim()} className="self-end px-12 py-4 bg-primary text-white font-black text-[10px] uppercase rounded-2xl shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 tracking-widest">Опубликовать</button>
                </form>
            ) : (
                <div className="text-center py-10"><button onClick={openAuthModal} className="px-10 py-4 bg-white/5 border border-white/10 rounded-2xl font-black text-white text-xs uppercase hover:bg-white/10 transition-all">Войти, чтобы комментировать</button></div>
            )}
        </div>

        <div className="space-y-8">
            {comments.map((comment) => (
                <div key={comment.id} className="flex gap-5 group">
                    <img src={comment.user.avatar} className="w-14 h-14 rounded-2xl object-cover shrink-0 shadow-md ring-2 ring-white/5" alt="" />
                    <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2"><span className="font-black text-white text-base">{comment.user.name}</span><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{comment.date}</span></div>
                        <div className="text-slate-400 text-base leading-relaxed bg-white/[0.02] p-6 rounded-[2rem] border border-white/5 group-hover:border-white/10 transition-colors shadow-sm markdown-body">
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
                                {filterProfanity(comment.text)}
                            </ReactMarkdown>
                        </div>
                        <button 
                            onClick={() => handleReplyToComment(comment)}
                            className="mt-3 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <Reply className="w-3 h-3" /> Ответить
                        </button>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default NewsDetails;