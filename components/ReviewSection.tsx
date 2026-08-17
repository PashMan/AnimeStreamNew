import React, { useState } from 'react';
import { Star, User, Send, ChevronDown, ChevronUp, MessageSquare, ShieldCheck, Eye, Edit3, AlertTriangle } from 'lucide-react';
import { Review, User as UserType } from '../types';
import { db } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

interface ReviewSectionProps {
  animeId: string;
  reviews: Review[];
  onReviewAdded: (review: Review) => void;
  onReport?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const ReviewSection: React.FC<ReviewSectionProps> = ({ animeId, reviews, onReviewAdded, onReport, onDelete }) => {
  const { user, openAuthModal } = useAuth();
  const [isWriting, setIsWriting] = useState(false);
  const [content, setContent] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [ratings, setRatings] = useState({ plot: 5, sound: 5, visuals: 5, overall: 5 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());

  const toggleReview = (id: string) => {
    const newExpanded = new Set(expandedReviews);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedReviews(newExpanded);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { openAuthModal(); return; }
    if (!content.trim() || content.length < 50) {
      alert('Рецензия должна содержать минимум 50 символов');
      return;
    }

    setIsSubmitting(true);
    try {
      const newReview = await db.addReview(animeId, user, content, ratings);
      if (newReview) {
        onReviewAdded(newReview);
        setContent('');
        setRatings({ plot: 5, sound: 5, visuals: 5, overall: 5 });
        setIsWriting(false);
      }
    } catch (err: any) {
      alert(err.message || 'Произошла ошибка при публикации рецензии');
    } finally {
      setIsSubmitting(false);
    }
  };

  const RatingInput = ({ label, value, field }: { label: string, value: number, field: keyof typeof ratings }) => (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
        <span className="text-primary font-black text-xs">{value}/10</span>
      </div>
      <input 
        type="range" 
        min="1" 
        max="10" 
        value={value} 
        onChange={(e) => setRatings({ ...ratings, [field]: parseInt(e.target.value) })}
        className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );

  return (
    <div className="mt-16">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Рецензии</h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{reviews.length} мнений пользователей</p>
          </div>
        </div>
        {!isWriting && (
          <button 
            onClick={() => user ? setIsWriting(true) : openAuthModal()}
            className="px-6 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/80 transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            Написать рецензию
          </button>
        )}
      </div>

      <AnimatePresence>
        {isWriting && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-12 p-6 glass rounded-[2rem] border border-white/10"
          >
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <RatingInput label="Сюжет" value={ratings.plot} field="plot" />
                <RatingInput label="Звук" value={ratings.sound} field="sound" />
                <RatingInput label="Визуал" value={ratings.visuals} field="visuals" />
                <RatingInput label="Общая" value={ratings.overall} field="overall" />
              </div>
              
              <div className="relative">
                <div className="flex items-center gap-2 mb-2">
                  <button 
                    type="button"
                    onClick={() => setIsPreview(false)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${!isPreview ? 'bg-primary text-white' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                  >
                    <Edit3 className="w-3 h-3 inline-block mr-1" /> Редактор
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsPreview(true)}
                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${isPreview ? 'bg-primary text-white' : 'bg-white/5 text-slate-500 hover:text-white'}`}
                  >
                    <Eye className="w-3 h-3 inline-block mr-1" /> Предпросмотр
                  </button>
                </div>

                {isPreview ? (
                  <div className="w-full h-48 bg-black/40 border border-white/5 rounded-2xl p-4 overflow-y-auto markdown-body prose-sm max-w-none break-words whitespace-pre-wrap">
                    {content ? (
                      <Markdown>{content}</Markdown>
                    ) : (
                      <p className="text-slate-600 italic">Ничего не написано...</p>
                    )}
                  </div>
                ) : (
                  <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Поделитесь своим развернутым мнением об этом аниме... Поддерживается Markdown (минимум 50 символов)"
                    className="w-full h-48 bg-black/40 border border-white/5 rounded-2xl p-4 text-white placeholder:text-slate-600 focus:outline-none focus:border-primary/50 transition-colors resize-none text-sm leading-relaxed"
                  />
                )}
                <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {content.length} символов
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsWriting(false)}
                  className="px-6 py-2.5 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                >
                  Отмена
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting || content.length < 50}
                  className="px-8 py-2.5 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? 'Публикация...' : <><Send className="w-3 h-3" /> Опубликовать</>}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {reviews.length === 0 ? (
          <div className="p-12 text-center glass rounded-[2rem] border border-dashed border-white/10">
            <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Пока нет ни одной рецензии. Будьте первым!</p>
          </div>
        ) : (
          reviews.map((review) => {
            const isExpanded = expandedReviews.has(review.id);
            const filteredContent = review.content;
            const shouldShowExpand = filteredContent.length > 300;
            const displayContent = isExpanded ? filteredContent : filteredContent.slice(0, 300) + (shouldShowExpand ? '...' : '');

            return (
              <motion.div 
                layout
                key={review.id}
                className="p-6 glass rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors group"
              >
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex flex-col items-center gap-3 min-w-[120px]">
                    <img src={review.user.avatar} alt={review.user.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-primary/20" />
                    <div className="text-center">
                      <p className="text-white font-black text-xs uppercase tracking-tighter truncate max-w-[120px]">{review.user.name}</p>
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 w-full">
                      <div className="bg-black/40 p-1.5 rounded-lg text-center border border-white/5">
                        <p className="text-[7px] font-black text-slate-500 uppercase">Сюжет</p>
                        <p className="text-[10px] font-black text-primary">{review.ratings.plot}</p>
                      </div>
                      <div className="bg-black/40 p-1.5 rounded-lg text-center border border-white/5">
                        <p className="text-[7px] font-black text-slate-500 uppercase">Звук</p>
                        <p className="text-[10px] font-black text-primary">{review.ratings.sound}</p>
                      </div>
                      <div className="bg-black/40 p-1.5 rounded-lg text-center border border-white/5">
                        <p className="text-[7px] font-black text-slate-500 uppercase">Визуал</p>
                        <p className="text-[10px] font-black text-primary">{review.ratings.visuals}</p>
                      </div>
                      <div className="bg-black/40 p-1.5 rounded-lg text-center border border-primary/20 bg-primary/5">
                        <p className="text-[7px] font-black text-primary uppercase">Итог</p>
                        <p className="text-[10px] font-black text-primary">{review.ratings.overall}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="markdown-body max-w-none">
                      <div className="text-slate-300 text-sm leading-relaxed break-words whitespace-pre-wrap">
                        <Markdown>{displayContent}</Markdown>
                      </div>
                    </div>
                    {shouldShowExpand && (
                      <button 
                        onClick={() => toggleReview(review.id)}
                        className="mt-4 flex items-center gap-1.5 text-primary text-[10px] font-black uppercase tracking-widest hover:text-primary/80 transition-colors"
                      >
                        {isExpanded ? <><ChevronUp className="w-3 h-3" /> Свернуть</> : <><ChevronDown className="w-3 h-3" /> Читать далее</>}
                      </button>
                    )}
                    <div className="mt-4 flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onReport && (
                        <button 
                          onClick={() => onReport(review.id)}
                          className="text-[10px] font-bold text-slate-500 hover:text-red-500 uppercase tracking-widest flex items-center gap-1"
                        >
                          <AlertTriangle className="w-3 h-3" /> Пожаловаться
                        </button>
                      )}
                      {onDelete && (user?.role === 'admin' || user?.role === 'moderator') && (
                        <button 
                          onClick={() => onDelete(review.id)}
                          className="text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest flex items-center gap-1"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ReviewSection;
