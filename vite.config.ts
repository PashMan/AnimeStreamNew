
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',
  define: {
    'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY || ''),
    'process.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY || ''),
    'process.env.GROQ_API_KEY': JSON.stringify(process.env.GROQ_API_KEY || '')
  },
  server: {
    proxy: {
      '/api/shikimori': {
        target: 'https://shikimori.one/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/shikimori/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://shikimori.one/'
        }
      },
      '/api/media': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/balancer': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/proxy-4k': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/manga': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/anilibria': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/image': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/ai': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/debug-logs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/test-log': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/kodik': {
        target: 'https://kodikapi.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/kodik/, ''),
      },
      '/api/anilist': {
        target: 'https://graphql.anilist.co',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/anilist/, ''),
      }
    },
    host: true // Expose to network for testing
  },
  preview: {
    proxy: {
      '/api/shikimori': {
        target: 'https://shikimori.one/api',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/shikimori/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://shikimori.one/'
        }
      },
      '/api/media': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/balancer': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/proxy-4k': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/manga': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/anilibria': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/image': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/ai': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/debug-logs': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/test-log': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/api/kodik': {
        target: 'https://kodikapi.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/kodik/, ''),
      },
      '/api/anilist': {
        target: 'https://graphql.anilist.co',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/anilist/, ''),
      }
    },
    host: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom', 'react-helmet-async'],
          'ui-vendor': ['lucide-react'],
          'supabase-vendor': ['@supabase/supabase-js'],
          'markdown-vendor': ['react-markdown', 'rehype-raw', 'remark-gfm'],
        }
      }
    }
  }
});
