import React, { useState } from 'react';
import { Crown, Sparkles, CheckCircle, Send, Shield, Zap, Star, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';

const Premium: React.FC = () => {
  const { user, openAuthModal, updateProfile } = useAuth();
  const [upscaleAnime, setUpscaleAnime] = useState('');
  const [isUpscaleSent, setIsUpscaleSent] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  const handleBuyPremium = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    setIsBuying(true);
    // Simulate payment process
    setTimeout(async () => {
      const success = await updateProfile({ isPremium: true });
      setIsBuying(false);
      if (success) {
          // Success feedback could be a toast, but for now we rely on the UI update
          // The component will re-render with the "You are Premium" view
      } else {
          alert('Не удалось оформить подписку. Возможно, произошла ошибка соединения.');
      }
    }, 1500);
  };

  const handleUpscaleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.isPremium) return;
    if (!upscaleAnime.trim()) return;
    
    await db.requestUpscale(user.id || user.email, upscaleAnime);
    setIsUpscaleSent(true);
    setUpscaleAnime('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16 space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-yellow-500/10 rounded-full mb-4">
          <Crown className="w-12 h-12 text-yellow-500" />
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-black text-white uppercase tracking-tighter">
          KamiAnime <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600">Premium</span>
        </h1>
        <p className="text-slate-400 max-w-2xl mx-auto font-medium text-lg">
          Откройте новые возможности и поддержите проект. Получите доступ к эксклюзивным функциям и максимальному качеству.
        </p>
      </div>

      {!user?.isPremium ? (
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8 mb-20">
          <div className="bg-surface/30 border border-white/5 rounded-[2rem] p-10 shadow-2xl backdrop-blur-sm">
            <h3 className="text-2xl font-black text-white uppercase mb-4">Фан</h3>
            <p className="text-xs text-slate-400 mb-8 font-medium">Для тех, кто хочет наслаждаться аниме без рекламы на одном экране.</p>
            <ul className="space-y-6 mb-10">
              <li className="flex items-center gap-4 text-slate-300"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Просмотр без рекламы</li>
              <li className="flex items-center gap-4 text-slate-300"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Безграничный доступ к библиотеке KamiAnime</li>
              <li className="flex items-center gap-4 text-slate-300"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Доступ сразу после трансляции в Японии (Simulcast)</li>
              <li className="flex items-center gap-4 text-slate-300"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Качество Full HD (1080p)</li>
              <li className="flex items-center gap-4 text-slate-500"><XCircle className="w-6 h-6" /> Оффлайн-просмотр (скачивание серий)</li>
              <li className="flex items-center gap-4 text-slate-500"><XCircle className="w-6 h-6" /> Одновременный просмотр на 4 устройствах</li>
            </ul>
            <div className="text-3xl font-black text-white mb-6">299 ₽ <span className="text-xs text-slate-400 font-medium">/ мес</span></div>
            <button 
              onClick={handleBuyPremium}
              disabled={isBuying}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black rounded-xl uppercase tracking-widest text-[10px] transition-all"
            >
              Выбрать тариф Фан
            </button>
          </div>

          <div className="bg-gradient-to-br from-[#8B5CF6]/15 to-violet-500/10 border border-[#8B5CF6]/30 rounded-[2rem] p-10 shadow-2xl backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#8B5CF6]/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
            <div className="absolute top-6 right-6 px-4 py-1 bg-[#8B5CF6] text-white font-black text-[9px] uppercase tracking-widest rounded-full">Рекомендуем</div>
            <h3 className="text-2xl font-black text-[#8B5CF6] uppercase mb-4 font-display">Мега Фан</h3>
            <p className="text-xs text-slate-300 mb-8 font-medium">Максимальный доступ для истинных ценителей аниме. Скачивайте серии и смотрите на любых устройствах.</p>
            <ul className="space-y-6 mb-10 relative z-10">
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Просмотр без рекламы</li>
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Оффлайн-просмотр (скачать серию в приложении)</li>
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Одновременный просмотр на 4 устройствах</li>
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Доступ к качеству Ultra HD (4K)</li>
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Интегрированный заказ апскейла тайтлов</li>
              <li className="flex items-center gap-4 text-white"><CheckCircle className="w-6 h-6 text-[#8B5CF6]" /> Скидки на мерч в магазине и значок профиля</li>
            </ul>
            <div className="text-3xl font-black text-white mb-6">399 ₽ <span className="text-xs text-slate-300 font-medium font-sans">/ мес</span></div>
            <button 
              onClick={handleBuyPremium}
              disabled={isBuying}
              className="w-full py-4 bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:from-[#9D71FD] hover:to-[#8B5CF6] text-black font-black rounded-xl uppercase tracking-widest text-[10px] shadow-xl shadow-[#8B5CF6]/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {isBuying ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Crown className="w-4 h-4 fill-current" /> Выбрать Мега Фан</>}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto mb-20 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-gradient-to-br from-[#8B5CF6]/20 to-violet-500/20 border border-[#8B5CF6]/30 rounded-[2rem] p-10 shadow-2xl backdrop-blur-sm text-center">
            <Crown className="w-16 h-16 text-[#8B5CF6] mx-auto mb-6 fill-current animate-bounce" />
            <h2 className="text-3xl font-black text-white uppercase mb-4 font-display">Вы Мега Фан пользователь!</h2>
            <p className="text-slate-300 mb-8 max-w-sm mx-auto text-xs">Спасибо за то, что вы являетесь подписчиком KamiAnime Premium. Наслаждайтесь просмотром серий без рекламы на любых девайсах!</p>
            
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div className="bg-black/20 p-6 rounded-xl border border-white/5">
                <Sparkles className="w-8 h-8 text-[#8B5CF6] mb-4" />
                <h4 className="text-white font-bold mb-2 text-sm uppercase">Апскейл 4K</h4>
                <p className="text-[11px] text-slate-400">Улучшайте качество любимых серий мгновенно с помощью натренированных нейросетей.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-xl border border-white/5">
                <Star className="w-8 h-8 text-[#8B5CF6] mb-4" />
                <h4 className="text-white font-bold mb-2 text-sm uppercase">4 устройства</h4>
                <p className="text-[11px] text-slate-400">Делитесь просмотром с друзьями на любых экранах и смартфонах одновременно.</p>
              </div>
              <div className="bg-black/20 p-6 rounded-xl border border-white/5">
                <Shield className="w-8 h-8 text-[#8B5CF6] mb-4" />
                <h4 className="text-white font-bold mb-2 text-sm uppercase">Оффлайн Режим</h4>
                <p className="text-[11px] text-slate-400">Закачивайте серии на мобильные девайсы и продолжайте просмотр в дороге.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {user?.isPremium && (
        <section className="max-w-4xl mx-auto bg-gradient-to-br from-primary/20 to-accent/20 rounded-[3rem] border border-primary/20 p-10 shadow-2xl backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-primary/20 transition-all duration-1000"></div>
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-4 max-w-xl">
              <div className="flex items-center gap-3 text-primary">
                <Zap className="w-8 h-8 fill-current" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Premium Privilege</span>
              </div>
              <h3 className="text-3xl md:text-4xl font-display font-black text-white uppercase tracking-tighter leading-none">Заказать апскейл до 4K</h3>
              <p className="text-slate-400 font-medium leading-relaxed">
                Как премиум-пользователь, вы можете выбрать одно аниме, которое мы обработаем с помощью ИИ и добавим в качестве 4K.
              </p>
            </div>
            
            {isUpscaleSent ? (
              <div className="bg-white/5 border border-white/10 p-8 rounded-3xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-500">
                <Sparkles className="w-12 h-12 text-yellow-400" />
                <p className="font-black uppercase tracking-widest text-xs text-white">Заявка принята!</p>
              </div>
            ) : (
              <form onSubmit={handleUpscaleRequest} className="w-full md:w-auto flex flex-col sm:flex-row gap-4">
                <input 
                  type="text" 
                  value={upscaleAnime}
                  onChange={e => setUpscaleAnime(e.target.value)}
                  placeholder="Название аниме..."
                  className="h-16 px-8 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-slate-600 focus:border-primary outline-none min-w-[300px] transition-all"
                />
                <button type="submit" className="h-16 px-10 bg-primary hover:bg-violet-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-primary/20 uppercase text-[10px] tracking-widest">
                  Отправить <Send className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

// Simple XCircle component since we didn't import it
const XCircle = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="15" y1="9" x2="9" y2="15"></line>
    <line x1="9" y1="9" x2="15" y2="15"></line>
  </svg>
);

export default Premium;
