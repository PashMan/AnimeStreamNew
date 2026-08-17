import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/db';
import { Lock, Loader2 } from 'lucide-react';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we have a session (Supabase handles the hash fragment automatically)
    supabase.auth.getSession().then(({ data }: any) => {
      const session = data?.session;
      if (!session) {
        // If no session, maybe the link is invalid or expired
        setMessage({ type: 'error', text: 'Invalid or expired password reset link.' });
      }
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Password updated successfully! Redirecting...' });
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error updating password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0502] px-4">
      <div className="max-w-md w-full glass p-8 rounded-3xl border border-white/10">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Сброс пароля</h2>
          <p className="text-slate-400 text-sm">Введите новый пароль для вашего аккаунта</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-xl text-xs font-bold text-center ${message.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleReset} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Новый пароль</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
              <input 
                required 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••" 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm text-white focus:border-primary outline-none transition-all" 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full py-4 bg-primary hover:bg-violet-600 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Обновление...</span> : 'Сохранить новый пароль'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
