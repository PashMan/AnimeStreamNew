import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { initTvSystem } from './utils/tvDetection';
import './index.css';

// Initialize 10-foot TV UI scaling and safe-area if running on a Smart TV
initTvSystem();

// Automatically handle Vite dynamic import / chunk load errors after new deployments
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite Preload Error] New version deployed. Reloading page...', event);
  const reloadKey = 'kami_chunk_reload_ts';
  const lastReload = sessionStorage.getItem(reloadKey);
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem(reloadKey, String(now));
    window.location.reload();
  }
});

// Catch unhandled module load rejections
window.addEventListener('unhandledrejection', (event) => {
  const errorMsg = String(event.reason?.message || event.reason || '');
  if (
    errorMsg.includes('Failed to fetch dynamically imported module') ||
    errorMsg.includes('Expected a JavaScript-or-Wasm module script') ||
    errorMsg.includes('Loading chunk')
  ) {
    console.warn('[Chunk Loading Error Caught] Auto-reloading for latest bundle:', errorMsg);
    const reloadKey = 'kami_chunk_reload_ts';
    const lastReload = sessionStorage.getItem(reloadKey);
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem(reloadKey, String(now));
      window.location.reload();
    }
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <HelmetProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HelmetProvider>
  </React.StrictMode>
);