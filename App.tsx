
import React, { useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from './services/db';
import Layout from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';

// Simple guard for admin roles only
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (user?.role === 'admin') {
    return <>{children}</>;
  }
  return <Navigate to="/" replace />;
};

// Eager load critical pages (test)
import Home from './pages/Home';

// Resilient dynamic import helper that recovers from stale cached chunks after new deployments
function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return React.lazy(async () => {
    try {
      const component = await componentImport();
      if (!component || !component.default) {
        throw new Error('Imported module missing default export');
      }
      return component;
    } catch (error: any) {
      console.warn('[Chunk Load Failed] Stale bundle chunk detected. Auto refreshing for updated version...', error);
      
      const reloadKey = 'kami_chunk_page_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      
      // Auto-reload with timestamp parameter to bypass browser/CDN cache (3s cooldown)
      if (!lastReload || (now - parseInt(lastReload, 10)) > 3000) {
        sessionStorage.setItem(reloadKey, String(now));
        
        // Clear caches if supported
        if ('caches' in window) {
          try {
            caches.keys().then((names) => {
              names.forEach((name) => caches.delete(name));
            });
          } catch (_) {}
        }

        const url = new URL(window.location.href);
        url.searchParams.set('_v', String(now));
        window.location.replace(url.toString());
      }

      // Return a safe fallback component instead of undefined/throwing to avoid React TypeError
      const SafeFallback: React.FC = () => (
        <div className="min-h-screen flex flex-col items-center justify-center bg-dark text-slate-400 p-4">
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-5 py-3.5 rounded-2xl shadow-xl">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-slate-200">Обновление компонентов приложения...</span>
          </div>
        </div>
      );

      return { default: SafeFallback as unknown as T };
    }
  });
}

// Lazy load non-critical pages with chunk retry protection
const Catalog = lazyWithRetry(() => import('./pages/Catalog'));
const Manga = lazyWithRetry(() => import('./pages/Manga'));
const Games = lazyWithRetry(() => import('./pages/Games'));
const Collections = lazyWithRetry(() => import('./pages/Collections'));
const CollectionDetail = lazyWithRetry(() => import('./pages/CollectionDetail'));
const CommunityCollectionDetail = lazyWithRetry(() => import('./pages/CommunityCollectionDetail'));
const Details = lazyWithRetry(() => import('./pages/Details'));
const TextPage = lazyWithRetry(() => import('./pages/TextPage'));
const NewsDetails = lazyWithRetry(() => import('./pages/NewsDetails'));
const Forum = lazyWithRetry(() => import('./pages/Forum'));
const UserProfile = lazyWithRetry(() => import('./pages/UserProfile'));
const Premium = lazyWithRetry(() => import('./pages/Premium'));
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const Messages = lazyWithRetry(() => import('./pages/Messages'));
const Social = lazyWithRetry(() => import('./pages/Social'));
const ClubDetail = lazyWithRetry(() => import('./pages/ClubDetail'));
const News = lazyWithRetry(() => import('./pages/News'));
const AdminPanel = lazyWithRetry(() => import('./pages/AdminPanel'));
const DebugLogs = lazyWithRetry(() => import('./pages/DebugLogs'));

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ChunkErrorBoundary caught error]:', error, errorInfo);
    
    // Auto-recover if error is caused by missing chunk or module import error
    const msg = String(error?.message || error || '');
    if (
      msg.includes('dynamically imported module') ||
      msg.includes('Cannot read properties of undefined') ||
      msg.includes('Failed to fetch') ||
      msg.includes('Importing a module script failed')
    ) {
      const reloadKey = 'kami_chunk_page_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || (now - parseInt(lastReload, 10)) > 3000) {
        sessionStorage.setItem(reloadKey, String(now));
        const url = new URL(window.location.href);
        url.searchParams.set('_v', String(now));
        window.location.replace(url.toString());
      }
    }
  }

  handleReload = () => {
    sessionStorage.removeItem('kami_chunk_page_reload');
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-dark text-white p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">Обновление приложения</h2>
          <p className="text-slate-400 text-sm max-w-md mb-6">
            Было выпущено обновление сайта. Нажмите кнопку ниже, чтобы перезагрузить страницу с актуальной версией.
          </p>
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 rounded-xl bg-primary text-white font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 cursor-pointer"
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-dark">
    <Loader2 className="w-10 h-10 text-primary animate-spin" />
  </div>
);

const AuthEventHandler = () => {
  const navigate = useNavigate();
  
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, _session: any) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password');
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return null;
};

const App: React.FC = () => {
  useEffect(() => {
    // Remove the initial loader once the React app mounts
    const loader = document.querySelector('.loader-overlay');
    if (loader) {
      loader.remove();
    }
  }, []);

  const isMangaMode = typeof window !== 'undefined' && (
    window.location.hostname.startsWith('manga.') || 
    localStorage.getItem('kami_manga_mode') === 'true'
  );

  return (
    <Router>
      <AuthEventHandler />
      <ScrollToTop />
      <ChunkErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/debug-logs" element={<DebugLogs />} />
            <Route path="/" element={<Layout />}>
              <Route index element={isMangaMode ? <Manga /> : <Home />} />
              <Route path="catalog" element={<Catalog />} />
              <Route path="manga" element={<Manga />} />
              <Route path="games" element={<AdminRoute><Games /></AdminRoute>} />
              <Route path="collections" element={<Collections />} />
              <Route path="collections/:id" element={<CollectionDetail />} />
              <Route path="collections/community/:id" element={<CommunityCollectionDetail />} />
              <Route path="news" element={<News />} />
              <Route path="news/:id" element={<NewsDetails />} />
              <Route path="anime/:id/*" element={<Details />} />
              <Route path="profile" element={<Profile />} />
              <Route path="user/:id" element={<UserProfile />} />
              <Route path="favorites" element={<Navigate to="/profile" replace />} />
              <Route path="messages" element={<Messages />} />
              <Route path="social" element={<Social />} />
              <Route path="club/:id" element={<ClubDetail />} />
              <Route path="community" element={<Navigate to="/social" replace />} />
              <Route path="forum" element={<Forum />} />
              <Route path="forum/:topicId" element={<Forum />} />
              <Route path="premium" element={<Navigate to="/" replace />} />
              <Route path="admin" element={<AdminPanel />} />
              <Route path="debug" element={<Navigate to="/debug-logs" replace />} />
              
              {/* Footer Pages */}
              <Route path="privacy" element={<TextPage />} />
              <Route path="terms" element={<TextPage />} />
              <Route path="dmca" element={<TextPage />} />
              <Route path="faq" element={<TextPage />} />
              <Route path="contact" element={<TextPage />} />
            </Route>
          </Routes>
        </Suspense>
      </ChunkErrorBoundary>
    </Router>
  );
};

export default App;