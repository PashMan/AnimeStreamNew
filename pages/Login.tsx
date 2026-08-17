
import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, Eye } from 'lucide-react';
import { Logo } from '../components/Layout';

const Login: React.FC = () => {
  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-dark">
      {/* Background Ambience */}
      <div className="absolute inset-0">
         <img src="https://picsum.photos/seed/bglogin/1920/1080" alt="Background" className="w-full h-full object-cover opacity-20 blur-sm" />
         <div className="absolute inset-0 bg-dark/80"></div>
      </div>
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px]"></div>
      <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-[100px]"></div>

      <div className="relative z-10 w-full max-w-md p-4">
         <div className="glass border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
            <div className="text-center mb-8">
               <div className="inline-flex justify-center mb-4">
                  <Logo />
               </div>
               <h2 className="text-2xl font-bold text-white mb-2">Welcome Back</h2>
               <p className="text-sm text-slate-400">Sign in to sync your watchlist across devices.</p>
            </div>

            <div className="flex p-1 bg-surface rounded-lg mb-8">
               <button className="flex-1 py-2 text-sm font-bold rounded bg-primary text-white shadow-lg">Login</button>
               <button className="flex-1 py-2 text-sm font-bold rounded text-slate-400 hover:text-white transition-colors">Register</button>
            </div>

            <form className="space-y-5">
               <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-1">Email Address</label>
                  <div className="relative">
                     <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                     <input type="email" placeholder="name@example.com" className="w-full bg-surface/50 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:border-primary outline-none transition-all placeholder:text-slate-600" />
                  </div>
               </div>
               
               <div className="space-y-2">
                  <div className="flex justify-between ml-1">
                     <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Password</label>
                     <a href="#" className="text-xs font-bold text-primary hover:text-violet-400">Forgot?</a>
                  </div>
                  <div className="relative">
                     <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                     <input type="password" placeholder="••••••••" className="w-full bg-surface/50 border border-white/10 rounded-xl py-3 pl-12 pr-12 text-sm text-white focus:border-primary outline-none transition-all placeholder:text-slate-600" />
                     <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                        <Eye className="w-4 h-4" />
                     </button>
                  </div>
               </div>

               <Link to="/" className="block w-full py-3.5 bg-primary hover:bg-violet-600 text-white font-bold rounded-xl text-center shadow-lg shadow-primary/25 transition-all mt-4">
                  Sign In
               </Link>
            </form>

            <div className="relative my-8">
               <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
               <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#121926] px-4 text-slate-500 font-bold">Or continue with</span></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <button className="flex items-center justify-center gap-2 bg-surface hover:bg-white/5 border border-white/10 py-2.5 rounded-xl transition-all">
                  <span className="font-bold text-sm text-slate-300">Google</span>
               </button>
               <button className="flex items-center justify-center gap-2 bg-surface hover:bg-white/5 border border-white/10 py-2.5 rounded-xl transition-all">
                   <span className="font-bold text-sm text-slate-300">Discord</span>
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};

export default Login;