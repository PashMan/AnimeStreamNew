import React, { useState } from 'react';
import { 
  Crown, 
  Check, 
  Zap, 
  Download, 
  Tv, 
  BookOpen, 
  CreditCard, 
  QrCode, 
  Wallet, 
  ArrowRight, 
  Loader2, 
  CheckCircle2,
  Vote
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Plan {
  id: 'day' | 'month' | 'year';
  title: string;
  durationDays: number;
  price: number;
  period: string;
  badge?: string;
  discount?: string;
  description: string;
}

const COMMON_PREMIUM_FEATURES = [
  'Просмотр всех аниме в 4K качестве',
  'Скачивание любых серий на устройство',
  'Доступ к эксклюзивному каталогу 4K аниме',
  'Голосование за добавление 4K аниме',
  'Переход к чтению манги с момента в серии',
  'Значок Premium в профиле и комментариях'
];

const PLANS: Plan[] = [
  {
    id: 'day',
    title: '1 День',
    durationDays: 1,
    price: 49,
    period: '24 часа',
    description: 'Доступ ко всем возможностям Premium на 24 часа'
  },
  {
    id: 'month',
    title: '1 Месяц',
    durationDays: 30,
    price: 199,
    period: 'в месяц',
    badge: '1-й месяц бесплатно',
    description: 'Оптимальный доступ ко всем возможностям на 30 дней'
  },
  {
    id: 'year',
    title: '1 Год',
    durationDays: 365,
    price: 1490,
    period: 'в год',
    badge: 'Выгода 40%',
    discount: '≈ 124 ₽ / мес',
    description: 'Полный безлимитный доступ ко всем возможностям на 365 дней'
  }
];

const Premium: React.FC = () => {
  const { user, isVip, openAuthModal, activateVip } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[1]);
  const [paymentMethod, setPaymentMethod] = useState<'sbp' | 'card' | 'yoomoney' | 'crypto'>('sbp');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
        alert('Не удалось активировать Premium. Пожалуйста, попробуйте снова.');
      }
    }, 1200);
  };

  const daysLeft = user?.premiumUntil
    ? Math.max(0, Math.ceil((new Date(user.premiumUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 text-white">
      {/* Header */}
      <div className="text-center mb-10 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[#A78BFA] text-xs font-black uppercase tracking-widest shadow-lg shadow-[#8B5CF6]/10">
          <Crown className="w-4 h-4 text-[#8B5CF6]" />
          <span>Premium</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-display font-black tracking-tight uppercase">
          Максимум качества в <span className="text-[#8B5CF6]">4K</span>
        </h1>
        
        <p className="text-slate-400 max-w-2xl mx-auto font-medium text-sm sm:text-base leading-relaxed">
          Смотрите любимое аниме в 4K качестве, скачивайте серии на устройство, голосуйте за добавление новых тайтлов в 4K и читайте мангу с момента окончания серии.
        </p>

        {/* Free Registration Banner */}
        <div className="max-w-xl mx-auto mt-6 p-4 rounded-2xl bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 flex items-center justify-center gap-3 text-xs sm:text-sm font-bold text-slate-200 shadow-xl">
          <Crown className="w-4 h-4 text-[#8B5CF6] shrink-0" />
          <span>
            Всем новым пользователям: <strong className="text-white underline decoration-[#8B5CF6] underline-offset-4">1 месяц Premium бесплатно</strong> при регистрации!
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {isSuccess && (
        <div className="max-w-3xl mx-auto mb-10 p-6 rounded-3xl bg-emerald-950/60 border border-emerald-500/40 text-center animate-in zoom-in-95 duration-300">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-2xl font-black uppercase text-white">Premium подписка успешно активирована!</h2>
          <p className="text-slate-300 text-sm mt-1">
            Теперь вам доступен просмотр в 4K, скачивание любых серий, голосование за тайтлы и все возможности Premium.
          </p>
        </div>
      )}

      {/* Active Premium Status Card */}
      {isVip && (
        <div className="max-w-3xl mx-auto mb-10 p-6 sm:p-7 rounded-3xl bg-[#141519] border border-[#8B5CF6]/40 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-14 h-14 rounded-2xl bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6] shrink-0 shadow-lg shadow-[#8B5CF6]/20">
                <Crown className="w-8 h-8" />
              </div>
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-xl font-display font-black uppercase text-white">
                    Ваш статус: <span className="text-[#8B5CF6]">Premium Активен</span>
                  </h3>
                </div>
                <p className="text-xs text-slate-300 font-medium mt-1">
                  {user?.premiumUntil ? (
                    <>
                      Осталось: <strong className="text-white">{daysLeft} дн.</strong> (до {new Date(user.premiumUntil).toLocaleDateString('ru-RU')})
                    </>
                  ) : (
                    'Бессрочный Premium доступ'
                  )}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                const el = document.getElementById('single-premium-card');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-[#8B5CF6]/20 cursor-pointer"
            >
              Продлить Premium
            </button>
          </div>
        </div>
      )}

      {/* SINGLE UNIFIED SUBSCRIPTION CARD */}
      <div id="single-premium-card" className="max-w-3xl mx-auto mb-16 rounded-3xl bg-[#14151C] border border-[#8B5CF6]/40 p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#8B5CF6]/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10 space-y-8">
          {/* Card Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 rounded-full text-[#A78BFA] text-[10px] font-black uppercase tracking-widest mb-2">
                <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />
                Единая подписка
              </div>
              <h2 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight text-white">
                Тариф Premium
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Выберите подходящий период подписки. Все возможности включены в любой период.
              </p>
            </div>

            {/* Current Price Block */}
            <div className="text-left sm:text-right bg-black/40 sm:bg-transparent p-4 sm:p-0 rounded-2xl sm:rounded-none border border-white/5 sm:border-0 shrink-0">
              <div className="flex items-baseline sm:justify-end gap-1">
                <span className="text-3xl sm:text-4xl font-display font-black text-white">
                  {selectedPlan.price} ₽
                </span>
                <span className="text-xs font-bold text-slate-400">
                  / {selectedPlan.period}
                </span>
              </div>
              {selectedPlan.discount && (
                <div className="text-xs font-bold text-emerald-400 mt-0.5">
                  {selectedPlan.discount}
                </div>
              )}
            </div>
          </div>

          {/* DURATION SELECTOR (Tabs / Segmented Control) */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
              Срок действия подписки
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PLANS.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] ring-1 ring-[#8B5CF6] shadow-xl shadow-[#8B5CF6]/20 scale-[1.02]'
                        : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-[#8B5CF6] text-white font-black text-[9px] uppercase tracking-wider rounded-full shadow-md">
                        {plan.badge}
                      </span>
                    )}
                    <div>
                      <div className="text-sm font-black uppercase text-white font-display">
                        {plan.title}
                      </div>
                      <div className="text-xs font-bold text-[#A78BFA] mt-1">
                        {plan.price} ₽
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                        {plan.description}
                      </p>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/5">
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {plan.period}
                      </span>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-[#8B5CF6] bg-[#8B5CF6] text-white' : 'border-white/20'
                      }`}>
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ALL INCLUDED FEATURES LIST */}
          <div className="bg-black/35 rounded-2xl p-5 border border-white/5">
            <div className="text-xs font-black uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-2">
              <Crown className="w-4 h-4 text-[#8B5CF6]" />
              <span>Что входит в подписку Premium</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {COMMON_PREMIUM_FEATURES.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs text-slate-200">
                  <div className="w-5 h-5 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6] shrink-0">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PAYMENT METHODS */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
              Способ оплаты
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('sbp')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === 'sbp'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/40'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-5 h-5 text-emerald-400" />
                <span>СБП 0%</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/40'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-5 h-5 text-blue-400" />
                <span>Карта МИР</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('yoomoney')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === 'yoomoney'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/40'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Wallet className="w-5 h-5 text-violet-400" />
                <span>ЮMoney</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('crypto')}
                className={`p-3.5 rounded-2xl border flex flex-col items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                  paymentMethod === 'crypto'
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/40'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-5 h-5 text-[#A78BFA]" />
                <span>USDT / TON</span>
              </button>
            </div>
          </div>

          {/* ACTION BUTTON */}
          <div className="pt-2">
            {user ? (
              <button
                type="button"
                onClick={handleBuy}
                disabled={isProcessing}
                className="w-full py-4 px-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-[#8B5CF6]/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Обработка платежа...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 text-white" />
                    <span>Оплатить {selectedPlan.price} ₽ и активировать {selectedPlan.title}</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={openAuthModal}
                  className="w-full py-4 px-6 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl shadow-[#8B5CF6]/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <Crown className="w-5 h-5" />
                  <span>Зарегистрироваться и получить 1 месяц бесплатно</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>
                <p className="text-center text-xs text-slate-400">
                  Покупка и активация Premium доступна после быстрой регистрации.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl sm:text-3xl font-display font-black uppercase text-center mb-6">
          Сравнение
        </h2>

        <div className="bg-[#12131A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="grid grid-cols-3 p-4 sm:p-5 bg-white/[0.02] border-b border-white/10 text-xs font-black uppercase tracking-wider text-slate-400">
            <div>Возможности</div>
            <div className="text-center">Базовый</div>
            <div className="text-center text-[#A78BFA] flex items-center justify-center gap-1">
              <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" /> Premium
            </div>
          </div>

          <div className="divide-y divide-white/5 text-xs sm:text-sm">
            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-[#8B5CF6] shrink-0" />
                <span>Качество 4K</span>
              </div>
              <div className="text-center text-slate-500 font-bold">1080p</div>
              <div className="text-center text-emerald-400 font-black">4K</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Скачивание серий</span>
              </div>
              <div className="text-center text-slate-500 font-bold">—</div>
              <div className="text-center text-emerald-400 font-black">Доступно</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Tv className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Каталог 4K аниме</span>
              </div>
              <div className="text-center text-slate-500 font-bold">—</div>
              <div className="text-center text-emerald-400 font-black">Полный доступ</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <Vote className="w-4 h-4 text-[#A78BFA] shrink-0" />
                <span>Голосование за 4K</span>
              </div>
              <div className="text-center text-slate-500 font-bold">—</div>
              <div className="text-center text-emerald-400 font-black">Доступно</div>
            </div>

            <div className="grid grid-cols-3 p-4 sm:p-5 items-center">
              <div className="font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-pink-400 shrink-0" />
                <span>Манга с момента в серии</span>
              </div>
              <div className="text-center text-slate-500 font-bold">—</div>
              <div className="text-center text-emerald-400 font-black">Доступно</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Premium;
