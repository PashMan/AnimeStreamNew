import React, { useState } from 'react';
import { 
  Crown, 
  Check, 
  X, 
  Zap, 
  Download, 
  Tv, 
  BookOpen, 
  Vote,
  CreditCard, 
  QrCode, 
  Wallet, 
  ArrowRight, 
  Loader2, 
  CheckCircle2 
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
    description: 'Доступ на 24 часа'
  },
  {
    id: 'month',
    title: '1 Месяц',
    durationDays: 30,
    price: 199,
    period: 'в месяц',
    badge: '1-й месяц бесплатно',
    description: 'Доступ на 30 дней'
  },
  {
    id: 'year',
    title: '1 Год',
    durationDays: 365,
    price: 1490,
    period: 'в год',
    badge: 'Выгода 40%',
    discount: '≈ 124 ₽ / мес',
    description: 'Доступ на 365 дней'
  }
];

export const PremiumModal: React.FC = () => {
  const { 
    user, 
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
        alert('Произошла ошибка при активации Premium. Попробуйте еще раз.');
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="relative bg-[#121318] border border-[#8B5CF6]/30 rounded-3xl p-5 sm:p-7 max-w-xl w-full shadow-2xl overflow-hidden my-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow background */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none -mr-24 -mt-24" />

        {/* Close Button */}
        <button
          onClick={closePremiumModal}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors z-20 cursor-pointer"
          aria-label="Закрыть"
        >
          <X className="w-5 h-5" />
        </button>

        {isSuccess ? (
          <div className="py-10 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center text-emerald-400 mb-4 shadow-xl shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8 animate-bounce" />
            </div>
            <h2 className="text-2xl font-display font-black uppercase text-white mb-2 tracking-tight">
              Добро пожаловать в Premium!
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm max-w-md mb-5">
              Подписка на {selectedPlan.title} успешно активирована. Теперь вам доступны 4K качество, скачивание серий и все возможности Premium.
            </p>
            <div className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[#A78BFA]">
              Приятного просмотра!
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 rounded-full text-[#A78BFA] text-[10px] font-black uppercase tracking-widest mb-2">
                <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />
                Единая подписка Premium
              </div>

              {premiumModalFeature ? (
                <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 p-3 rounded-2xl mb-3 text-left flex items-start gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#8B5CF6]/20 text-[#A78BFA] shrink-0 mt-0.5">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Функция: {premiumModalFeature}
                    </h4>
                    <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                      Доступна с подпиской Premium. Оформите доступ или зарегистрируйтесь для 1 месяца бесплатно!
                    </p>
                  </div>
                </div>
              ) : null}

              <h2 className="text-xl sm:text-2xl font-display font-black uppercase tracking-tight text-white">
                Все возможности платформы
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Качество 4K, прямое скачивание серий, чтение манги и голосование за тайтлы
              </p>
            </div>

            {/* Free Trial Banner */}
            <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/30 p-2.5 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-slate-200">
              <Crown className="w-4 h-4 text-[#8B5CF6] shrink-0" />
              <span>Всем новым пользователям: <strong className="text-white">1 месяц бесплатно</strong> при регистрации!</span>
            </div>

            {/* SINGLE CARD DURATION SELECTOR */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Выберите период
              </label>
              <div className="grid grid-cols-3 gap-2">
                {PLANS.map((plan) => {
                  const isSelected = selectedPlan.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`relative p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] ring-1 ring-[#8B5CF6] shadow-lg shadow-[#8B5CF6]/20'
                          : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.08]'
                      }`}
                    >
                      {plan.badge && (
                        <span className="absolute -top-2 right-2 px-1.5 py-0.2 bg-[#8B5CF6] text-white font-black text-[8px] uppercase tracking-wider rounded-full shadow-md">
                          {plan.badge}
                        </span>
                      )}
                      <div className="text-[11px] font-black uppercase text-white font-display">
                        {plan.title}
                      </div>
                      <div className="text-xs font-black text-[#A78BFA] mt-1">
                        {plan.price} ₽
                      </div>
                      <div className="text-[9px] text-slate-400">
                        {plan.period}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FEATURES INCLUDED */}
            <div className="bg-black/35 rounded-2xl p-3.5 border border-white/5">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>Включено в подписку</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {COMMON_PREMIUM_FEATURES.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-slate-200">
                    <div className="w-4 h-4 rounded-full bg-[#8B5CF6]/20 flex items-center justify-center text-[#8B5CF6] shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <span className="truncate">{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* PAYMENT METHODS */}
            {user && (
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">
                  Способ оплаты
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('sbp')}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
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
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-400" />
                    <span>Карта</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('yoomoney')}
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
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
                    className={`p-2 rounded-xl border flex flex-col items-center gap-1 text-[10px] font-bold transition-all cursor-pointer ${
                      paymentMethod === 'crypto'
                        ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-4 h-4 text-[#A78BFA]" />
                    <span>USDT</span>
                  </button>
                </div>
              </div>
            )}

            {/* ACTION BUTTON */}
            <div>
              {user ? (
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={isProcessing}
                  className="w-full py-3.5 px-4 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-[#8B5CF6]/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Активация...</span>
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4 text-white" />
                      <span>Оплатить {selectedPlan.price} ₽ ({selectedPlan.title})</span>
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleAction}
                  className="w-full py-3.5 px-4 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-black text-xs uppercase tracking-widest rounded-xl shadow-lg shadow-[#8B5CF6]/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <Crown className="w-4 h-4" />
                  <span>Получить 1 месяц Premium бесплатно</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
