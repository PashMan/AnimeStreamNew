import React, { useState } from 'react';
import { Crown, Sparkles, Check, X, Shield, Zap, Download, Tv, BookOpen, Volume2, CreditCard, QrCode, Wallet, ArrowRight, Loader2, CheckCircle2, Gift } from 'lucide-react';
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

const PLANS: Plan[] = [
  {
    id: 'day',
    title: '1 День',
    durationDays: 1,
    price: 49,
    period: '24 часа',
    description: 'Идеально для просмотра марафона аниме в 4K на выходных'
  },
  {
    id: 'month',
    title: '1 Месяц',
    durationDays: 30,
    price: 199,
    period: 'в месяц',
    badge: '1-й месяц бесплатно',
    description: 'Полный доступ ко всем VIP привилегиям и нейро-апскейлу'
  },
  {
    id: 'year',
    title: '1 Год',
    durationDays: 365,
    price: 1490,
    period: 'в год',
    badge: 'Выгода 40%',
    discount: '≈ 124 ₽ / мес',
    description: 'Максимальная экономия и приоритет в очереди нейросетей'
  }
];

export const PremiumModal: React.FC = () => {
  const { 
    user, 
    isVip, 
    isPremiumModalOpen, 
    closePremiumModal, 
    premiumModalFeature, 
    openAuthModal, 
    activateVip 
  } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[1]);
  const [paymentMethod, setPaymentMethod] = useState<'sbp' | 'card' | 'yoomoney' | 'crypto'>('sbp');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isPremiumModalOpen) return null;

  const handleAction = async () => {
    if (!user) {
      closePremiumModal();
      openAuthModal();
      return;
    }

    setIsProcessing(true);
    // Simulate real-time payment gateway handshake
    setTimeout(async () => {
      const ok = await activateVip(selectedPlan.durationDays);
      setIsProcessing(false);
      if (ok) {
        setIsSuccess(true);
        setTimeout(() => {
          setIsSuccess(false);
          closePremiumModal();
        }, 2500);
      } else {
        alert('Произошла ошибка при активации VIP. Попробуйте еще раз.');
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="relative bg-[#121318] border border-[#8B5CF6]/30 rounded-3xl p-5 sm:p-8 max-w-2xl w-full shadow-2xl overflow-hidden my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -ml-32 -mb-32"></div>

        {/* Close Button */}
        <button
          onClick={closePremiumModal}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-20"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-400 mb-6 shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-3xl font-display font-black uppercase text-white mb-2 tracking-tight">
              Добро пожаловать в VIP!
            </h2>
            <p className="text-slate-300 text-sm max-w-md mb-6">
              Подписка на {selectedPlan.title} успешно активирована. Теперь вам доступны 4K апскейл, скачивание серий и все эксклюзивные функции.
            </p>
            <div className="px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#A78BFA]">
              Приятного просмотра!
            </div>
          </div>
        ) : (
          <div>
            {/* Header / Reason */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 rounded-full text-[#A78BFA] text-[10px] font-black uppercase tracking-widest mb-3">
                <Crown className="w-3.5 h-3.5 fill-current text-yellow-400" />
                KamiAnime VIP Доступ
              </div>

              {premiumModalFeature ? (
                <div className="bg-gradient-to-r from-[#8B5CF6]/20 via-primary/15 to-transparent border border-[#8B5CF6]/30 p-3 rounded-2xl mb-4 text-left flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-[#8B5CF6]/20 text-[#A78BFA] shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Функция: {premiumModalFeature}
                    </h4>
                    <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                      Эта возможность входит в подписку Kami VIP. Оформите доступ или зарегистрируйтесь, чтобы получить 1 месяц бесплатно!
                    </p>
                  </div>
                </div>
              ) : null}

              <h2 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight text-white">
                Откройте максимальное качество
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-lg mx-auto">
                4K апскейл нейросетью, скачивание серий, чтение манги с конца серии и библиотека без рекламы
              </p>

              {/* Free Trial Banner */}
              <div className="mt-4 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/20 border border-amber-500/30 p-2.5 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-amber-200">
                <Gift className="w-4 h-4 text-yellow-400 shrink-0 animate-pulse" />
                <span>Всем новым пользователям: <strong className="text-white">1 месяц VIP бесплатно</strong> при регистрации!</span>
              </div>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              {PLANS.map((plan) => {
                const isSelected = selectedPlan.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-[#8B5CF6]/15 border-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/20 scale-[1.02]'
                        : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    {plan.badge && (
                      <span className="absolute -top-2.5 right-3 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-black text-[8px] uppercase tracking-wider rounded-full shadow-md">
                        {plan.badge}
                      </span>
                    )}
                    <div className="text-xs font-black uppercase text-slate-300 tracking-wider">
                      {plan.title}
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-white font-display">
                        {plan.price} ₽
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        / {plan.period}
                      </span>
                    </div>
                    {plan.discount && (
                      <div className="text-[10px] font-bold text-emerald-400 mt-0.5">
                        {plan.discount}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {plan.description}
                    </p>
                    <div className={`mt-3 w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-[#8B5CF6] bg-[#8B5CF6] text-black' : 'border-white/20'
                    }`}>
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Key Benefits List */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] mb-6 p-3 rounded-2xl bg-black/40 border border-white/5">
              <div className="flex items-center gap-2 text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                <span>4K WebGL2 Апскейл</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Скачивание серий MP4</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Tv className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Раздел 4K Аниме</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <BookOpen className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <span>Манга с конца серии</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Ultra Audio & Hi-Fi</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span>0% Рекламы</span>
              </div>
            </div>

            {/* Payment Methods (if user is logged in) */}
            {user && (
              <div className="mb-6">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Способ оплаты
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('sbp')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'sbp'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-emerald-400" />
                    <span>СБП 0%</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    <span>Карта МИР</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('yoomoney')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'yoomoney'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-violet-400" />
                    <span>ЮMoney</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('crypto')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'crypto'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span>USDT / TON</span>
                  </button>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {user ? (
              <button
                type="button"
                onClick={handleAction}
                disabled={isProcessing}
                className="w-full py-4 px-6 bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] hover:from-[#9D71FD] hover:to-[#8B5CF6] text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-[#8B5CF6]/25 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Активация VIP...</span>
                  </>
                ) : (
                  <>
                    <Crown className="w-4 h-4 fill-current text-yellow-400" />
                    <span>Оформить подписку за {selectedPlan.price} ₽</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleAction}
                  className="w-full py-4 px-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Gift className="w-4 h-4 fill-current" />
                  <span>Зарегистрироваться и получить 1 месяц бесплатно</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    closePremiumModal();
                    openAuthModal();
                  }}
                  className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all text-center"
                >
                  Уже есть аккаунт? Войти
                </button>
              </div>
            )}

            <div className="mt-4 text-center">
              <p className="text-[10px] text-slate-500">
                Безопасная оплата • Мгновенная активация • Отмена в любой момент в личном кабинете
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
