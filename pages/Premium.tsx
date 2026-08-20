import React, { useState } from 'react';
import { 
  Crown, 
  Sparkles, 
  Check, 
  X, 
  Shield, 
  Zap, 
  Download, 
  Tv, 
  BookOpen, 
  Volume2, 
  Send, 
  CreditCard, 
  QrCode, 
  Wallet, 
  Gift, 
  ArrowRight, 
  Loader2, 
  CheckCircle2, 
  Clock, 
  Layers, 
  HelpCircle 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/db';

interface Plan {
  id: 'day' | 'month' | 'year';
  title: string;
  durationDays: number;
  price: number;
  period: string;
  badge?: string;
  subBadge?: string;
  discount?: string;
  description: string;
  features: string[];
}

const PLANS: Plan[] = [
  {
    id: 'day',
    title: '1 День (Пробный)',
    durationDays: 1,
    price: 49,
    period: '24 часа',
    description: 'Идеально для просмотра аниме-марафона в 4K Ultra HD на выходных',
    features: [
      'Безлимитный 4K апскейл (AMD CAS)',
      'Скачивание серий на высокой скорости',
      'Доступ к разделу 4K Аниме',
      'Без рекламы'
    ]
  },
  {
    id: 'month',
    title: '1 Месяц (Стандарт)',
    durationDays: 30,
    price: 199,
    period: 'в месяц',
    badge: '1-й месяц бесплатно',
    subBadge: 'Популярный',
    description: 'Самый гибкий план со всеми привилегиями Kami VIP',
    features: [
      'Все преимущества тарифа 1 День',
      'Синхронизация: Читать мангу с момента конца серии',
      'Приоритетный заказ апскейла тайтлов',
      'Ultra Audio Hi-Fi битрейт & Dolby Sound',
      'Золотая корона VIP в профиле и чатах'
    ]
  },
  {
    id: 'year',
    title: '1 Год (Максимальный)',
    durationDays: 365,
    price: 1490,
    period: 'в год',
    badge: 'Выгода 40%',
    discount: '≈ 124 ₽ / мес',
    description: 'Максимальная экономия для настоящих отаку и фанатов качества',
    features: [
      'Все возможности на 365 дней',
      'Приоритет в очереди нейросетей обработки',
      'Эксклюзивные значки и темы профиля',
      'Поддержка разработки проекта'
    ]
  }
];

const Premium: React.FC = () => {
  const { user, isVip, openAuthModal, activateVip } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[1]);
  const [paymentMethod, setPaymentMethod] = useState<'sbp' | 'card' | 'yoomoney' | 'crypto'>('sbp');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const [upscaleAnime, setUpscaleAnime] = useState('');
  const [isUpscaleSent, setIsUpscaleSent] = useState(false);

  const handleBuy = async () => {
    if (!user) {
      openAuthModal();
      return;
    }

    setIsProcessing(true);
    setTimeout(async () => {
      const ok = await activateVip(selectedPlan.durationDays);
      setIsProcessing(false);
      if (ok) {
        setIsSuccess(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        alert('Не удалось активировать VIP. Пожалуйста, попробуйте снова.');
      }
    }, 1200);
  };

  const handleUpscaleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVip) {
      alert('Заказ апскейла доступен только с активной подпиской Kami VIP.');
      return;
    }
    if (!upscaleAnime.trim()) return;

    await db.requestUpscale(user?.id || user?.email || 'user', upscaleAnime);
    setIsUpscaleSent(true);
    setUpscaleAnime('');
  };

  // Calculate days remaining if active
  const daysLeft = user?.premiumUntil
    ? Math.max(0, Math.ceil((new Date(user.premiumUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-white">
      {/* Hero Header */}
      <div className="text-center mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-500/10">
          <Crown className="w-4 h-4 fill-current text-yellow-400" />
          <span>KamiAnime VIP Премиум</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-black tracking-tight uppercase">
          Максимум качества. <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">Без ограничений.</span>
        </h1>
        
        <p className="text-slate-400 max-w-2xl mx-auto font-medium text-sm sm:text-base leading-relaxed">
          Наслаждайтесь любимым аниме в 4K с аппаратным WebGL2 апскейлером, скачивайте серии для оффлайн-просмотра и моментально переходите к чтению манги с момента конца серии.
        </p>

        {/* Free Registration Gift Banner */}
        <div className="max-w-xl mx-auto mt-6 p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#8B5CF6]/20 to-amber-500/15 border border-amber-500/30 flex items-center justify-center gap-3 text-xs sm:text-sm font-bold text-amber-200 shadow-xl">
          <Gift className="w-5 h-5 text-yellow-400 shrink-0 animate-bounce" />
          <span>
            🎁 Всем новым пользователям дарим <strong className="text-white underline decoration-amber-400 underline-offset-4">1 месяц VIP бесплатно</strong> при регистрации!
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {isSuccess && (
        <div className="max-w-3xl mx-auto mb-12 p-6 rounded-3xl bg-emerald-950/60 border border-emerald-500/40 text-center animate-in zoom-in-95 duration-300">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-2xl font-black uppercase text-white">VIP Подписка успешно активирована!</h2>
          <p className="text-slate-300 text-sm mt-1">
            Теперь вам открыты 4K апскейлер AMD CAS, скачивание любых серий в MP4, каталог 4K и моментальный переход к манге.
          </p>
        </div>
      )}

      {/* Active VIP Status Card */}
      {isVip && (
        <div className="max-w-4xl mx-auto mb-14 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-[#1A1829] via-[#1E1934] to-[#1A1829] border border-amber-500/40 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-yellow-400 shrink-0 shadow-lg shadow-amber-500/20">
                <Crown className="w-8 h-8 fill-current animate-pulse" />
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-xl font-display font-black uppercase text-white">
                    Ваш статус: <span className="text-yellow-400">Kami VIP Активен</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-300 font-medium mt-1">
                  {user?.premiumUntil ? (
                    <>
                      Осталось: <strong className="text-yellow-300">{daysLeft} дн.</strong> (до {new Date(user.premiumUntil).toLocaleDateString('ru-RU')})
                    </>
                  ) : (
                    'Бессрочный VIP доступ'
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('pricing-plans');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              Продлить подписку
            </button>
          </div>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div id="pricing-plans" className="max-w-5xl mx-auto mb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight text-white">
            Тарифные планы
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Выберите удобный период. Без скрытых платежей, отмена в один клик.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isSelected = selectedPlan.id === plan.id;
            const isPopular = plan.id === 'month';

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`relative rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 cursor-pointer border ${
                  isSelected
                    ? 'bg-[#181628] border-[#8B5CF6] ring-2 ring-[#8B5CF6]/50 shadow-2xl shadow-[#8B5CF6]/20 scale-100 md:scale-105 z-10'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                }`}
              >
                {/* Badges */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-black text-[9px] uppercase tracking-widest rounded-full shadow-lg">
                    {plan.badge}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-lg font-black uppercase text-white font-display">
                      {plan.title}
                    </h3>
                    {isPopular && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-[#8B5CF6]/20 text-[#A78BFA] border border-[#8B5CF6]/40">
                        Хит
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                    {plan.description}
                  </p>

                  <div className="mb-6 p-4 rounded-2xl bg-black/40 border border-white/5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-display font-black text-white">
                        {plan.price} ₽
                      </span>
                      <span className="text-xs font-bold text-slate-400">
                        / {plan.period}
                      </span>
                    </div>
                    {plan.discount && (
                      <div className="text-xs font-bold text-emerald-400 mt-1">
                        {plan.discount}
                      </div>
                    )}
                  </div>

                  {/* Feature Bullets */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <Check className="w-4 h-4 text-[#8B5CF6] shrink-0 mt-0.5 stroke-[2.5]" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlan(plan);
                      handleBuy();
                    }}
                    className={`w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:from-[#9D71FD] hover:to-[#8B5CF6] text-white shadow-lg shadow-[#8B5CF6]/30'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5 fill-current text-yellow-400" />
                    <span>Выбрать {plan.title.split(' ')[0]}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Checkout Section */}
      <div className="max-w-3xl mx-auto mb-20 p-6 sm:p-8 rounded-3xl bg-[#13141C] border border-white/10 shadow-2xl">
        <h3 className="text-xl font-display font-black uppercase text-white mb-2 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-[#8B5CF6]" />
          <span>Быстрое оформление</span>
        </h3>
        <p className="text-xs text-slate-400 mb-6">
          Выбранный тариф: <strong className="text-white">{selectedPlan.title}</strong> за <strong className="text-yellow-400">{selectedPlan.price} ₽</strong>
        </p>

        {/* Payment Methods */}
        <div className="mb-6">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
            Выберите способ оплаты
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMethod('sbp')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === 'sbp'
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="w-5 h-5 text-emerald-400" />
              <span>СБП 0%</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('card')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === 'card'
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-5 h-5 text-blue-400" />
              <span>Карта МИР</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('yoomoney')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === 'yoomoney'
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Wallet className="w-5 h-5 text-violet-400" />
              <span>ЮMoney</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('crypto')}
              className={`p-3 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                paymentMethod === 'crypto'
                  ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <Zap className="w-5 h-5 text-amber-400" />
              <span>USDT / TON</span>
            </button>
          </div>
        </div>

        {/* Action Button */}
        {user ? (
          <button
            type="button"
            onClick={handleBuy}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:from-[#9D71FD] hover:to-[#8B5CF6] text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-[#8B5CF6]/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Обработка платежа...</span>
              </>
            ) : (
              <>
                <Crown className="w-4 h-4 fill-current text-yellow-400" />
                <span>Оплатить {selectedPlan.price} ₽ и активировать VIP</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={openAuthModal}
              className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Gift className="w-5 h-5 fill-current" />
              <span>Зарегистрироваться и получить 1 месяц бесплатно</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
            <p className="text-center text-xs text-slate-400">
              Покупка и активация VIP доступна только после входа в аккаунт.
            </p>
          </div>
        )}
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-4xl mx-auto mb-20">
        <h2 className="text-2xl sm:text-3xl font-display font-black uppercase text-center mb-8">
          Сравнение тарифов
        </h2>

        <div className="bg-[#12131A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="grid grid-cols-3 p-4 sm:p-6 bg-white/[0.02] border-b border-white/10 text-xs font-black uppercase tracking-wider text-slate-400">
            <div>Возможности</div>
            <div className="text-center">Бесплатно</div>
            <div className="text-center text-yellow-400 flex items-center justify-center gap-1">
              <Crown className="w-3.5 h-3.5 fill-current" /> Kami VIP
            </div>
          </div>

          <div className="divide-y divide-white/5 text-xs sm:text-sm">
            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                <span>4K WebGL2 Апскейлер (AMD CAS)</span>
              </div>
              <div className="text-center text-slate-500 font-bold">1080p Full HD</div>
              <div className="text-center text-emerald-400 font-black">4K Ultra HD (2160p)</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Скачивание серий MP4</span>
              </div>
              <div className="text-center text-red-400/80 flex justify-center">
                <X className="w-4 h-4" />
              </div>
              <div className="text-center text-emerald-400 font-black">Без ограничений</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Раздел 4K Аниме</span>
              </div>
              <div className="text-center text-red-400/80 flex justify-center">
                <X className="w-4 h-4" />
              </div>
              <div className="text-center text-emerald-400 font-black">Полный доступ</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-pink-400 shrink-0" />
                <span>Манга с конца серии</span>
              </div>
              <div className="text-center text-red-400/80 flex justify-center">
                <X className="w-4 h-4" />
              </div>
              <div className="text-center text-emerald-400 font-black">Синхронизация в 1 клик</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Реклама и баннеры</span>
              </div>
              <div className="text-center text-slate-400">Стандартная</div>
              <div className="text-center text-emerald-400 font-black">0% Рекламы</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Качество звука</span>
              </div>
              <div className="text-center text-slate-400">128-192 kbps</div>
              <div className="text-center text-emerald-400 font-black">Ultra 320 kbps & Hi-Fi</div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Upscale Request Form for VIP */}
      {isVip && (
        <section className="max-w-4xl mx-auto bg-gradient-to-br from-[#8B5CF6]/15 via-primary/10 to-transparent rounded-3xl border border-[#8B5CF6]/30 p-8 shadow-2xl backdrop-blur-md relative overflow-hidden mb-16">
          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-2 text-[#A78BFA]">
                <Zap className="w-5 h-5 fill-current" />
                <span className="text-xs font-black uppercase tracking-widest">VIP Привилегия</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-display font-black text-white uppercase tracking-tight">
                Заказать 4K обработку тайтла
              </h3>
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Как VIP подписчик вы можете предложить любое аниме, и наша нейросетевая ферма обработает его в 4K Ultra HD.
              </p>
            </div>

            {isUpscaleSent ? (
              <div className="bg-emerald-500/20 border border-emerald-500/40 p-6 rounded-2xl flex flex-col items-center gap-2 animate-in zoom-in-95">
                <Sparkles className="w-8 h-8 text-yellow-400" />
                <p className="font-black uppercase tracking-wider text-xs text-white">Заявка принята!</p>
              </div>
            ) : (
              <form onSubmit={handleUpscaleRequest} className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={upscaleAnime}
                  onChange={(e) => setUpscaleAnime(e.target.value)}
                  placeholder="Название аниме..."
                  className="h-12 px-5 bg-black/50 border border-white/15 rounded-xl text-white placeholder-slate-500 focus:border-[#8B5CF6] outline-none min-w-[240px] text-xs font-bold transition-all"
                />
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#8B5CF6]/20 uppercase text-xs tracking-wider cursor-pointer"
                >
                  <span>Отправить</span>
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default Premium;
