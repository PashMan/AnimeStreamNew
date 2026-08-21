
import React, { useState } from 'react';
import { X, Mail, Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Logo } from './Layout';

const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, login, loginWithGoogle, register, resetPassword } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'forgot-password'>('login');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: ''
  });

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      if (mode === 'login') {
        const success = await login({ email: formData.email, password: formData.password });
        if (!success) setError('Неверный email или пароль');
      } else if (mode === 'register') {
        if (!formData.name) {
          setError('Введите имя');
          setIsLoading(false);
          return;
        }
        const result = await register({ name: formData.name, email: formData.email, password: formData.password });
        if (!result.success) {
            setError(result.message || 'Ошибка регистрации');
        } else if (result.message) {
            setSuccessMsg(result.message);
        }
      } else if (mode === 'forgot-password') {
          const result = await resetPassword(formData.email);
          if (result.success) {
              setSuccessMsg(result.message || 'Ссылка для сброса пароля отправлена на email');
          } else {
              setError(result.message || 'Ошибка отправки');
          }
      }
    } catch (err) {
      setError('Произошла ошибка. Попробуйте позже.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await loginWithGoogle();
      if (result && !result.success && result.message) {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err?.message || 'Ошибка входа через Google. Попробуйте позже.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={closeAuthModal} />
      <div className="relative w-full max-w-md glass border border-white/10 rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
        <button aria-label="Close modal" onClick={closeAuthModal} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-8">
           <div className="inline-flex justify-center mb-4">
              <Logo />
           </div>
           <h2 className="text-xl font-bold text-white mb-2">
             {mode === 'login' ? 'С возвращением' : mode === 'register' ? 'Регистрация' : 'Восстановление пароля'}
           </h2>
           <p className="text-sm text-slate-400">
             {mode === 'login' ? 'Войдите, чтобы продолжить просмотр.' : mode === 'register' ? 'Присоединяйтесь к нам!' : 'Введите email для сброса пароля'}
           </p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-xs text-center">{error}</div>}
        {successMsg && <div className="mb-4 p-3 bg-green-500/10 border border-green-500/50 rounded-lg text-green-400 text-xs text-center">{successMsg}</div>}

        {mode !== 'forgot-password' && (
            <div className="flex p-1 bg-surface rounded-xl mb-6">
            <button type="button" onClick={() => setMode('login')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'login' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Вход</button>
            <button type="button" onClick={() => setMode('register')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${mode === 'register' ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>Регистрация</button>
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
           {mode === 'register' && (
             <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Имя пользователя</label>
                <div className="relative">
                   <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                   <input required name="name" value={formData.name} onChange={handleChange} type="text" placeholder="Имя" className="w-full bg-surface/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary outline-none transition-all" />
                </div>
             </div>
           )}

           <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Email</label>
              <div className="relative">
                 <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                 <input required name="email" value={formData.email} onChange={handleChange} type="email" placeholder="email@mail.com" className="w-full bg-surface/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary outline-none transition-all" />
              </div>
           </div>
           
           {mode !== 'forgot-password' && (
               <div className="space-y-1">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Пароль</label>
                    {mode === 'login' && (
                        <button type="button" onClick={() => setMode('forgot-password')} className="text-xs text-primary hover:text-white transition-colors">Забыли пароль?</button>
                    )}
                  </div>
                  <div className="relative">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                     <input required name="password" value={formData.password} onChange={handleChange} type="password" placeholder="••••••••" className="w-full bg-surface/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-primary outline-none transition-all" />
                  </div>
               </div>
           )}

           <button type="submit" disabled={isLoading} className="block w-full py-4 bg-primary hover:bg-violet-600 text-white font-black uppercase tracking-widest text-xs rounded-xl text-center shadow-lg shadow-primary/25 transition-all mt-4 disabled:opacity-70 disabled:cursor-not-allowed active:scale-95">
              {isLoading ? 'Загрузка...' : (mode === 'login' ? 'Войти' : mode === 'register' ? 'Создать аккаунт' : 'Сбросить пароль')}
           </button>

           {mode === 'forgot-password' && (
               <button type="button" onClick={() => setMode('login')} className="block w-full text-center text-sm text-slate-400 hover:text-white mt-4">
                   Вернуться ко входу
               </button>
           )}
        </form>

        {mode !== 'forgot-password' && (
            <div className="mt-6">
                <div className="relative flex items-center justify-center mb-4">
                    <div className="absolute inset-x-0 h-px bg-white/10"></div>
                    <span className="relative bg-[#111116] px-3 text-xs text-slate-500 uppercase">Или</span>
                </div>
                <button type="button" onClick={handleGoogleLogin} className="flex items-center justify-center w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-slate-200 transition-all gap-2">
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                    <span>Войти через Google</span>
                </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;