import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
  const envBase = process.env.VITE_BASE_PATH?.trim();
  const base =
    envBase && envBase.length > 0
      ? envBase.endsWith('/')
        ? envBase
        : `${envBase}/`
      : isGitHubActions
        ? '/Calgary-Watch-/'
        : '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify -- file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Raise warning threshold -- our bundle is large due to Leaflet + Recharts + Firebase.
      // Manual chunk splitting keeps vendor code separate and enables parallel loading.
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            // React core -- almost never changes between deploys
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Firebase SDK -- large but stable; split to allow parallel fetch
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            // Leaflet map engine - heat plugin must NOT be split separately
            // because it reads window.L at module evaluation time (before our
            // `window.L = L` assignment runs if it lands in a different chunk).
            'vendor-leaflet': ['leaflet'],
            // Charting library used only in AreaIntelligencePanel
            'vendor-recharts': ['recharts'],
            // Animation libraries
            'vendor-animation': ['gsap', 'motion/react', 'vaul'],
            // Date utilities
            'vendor-date': ['date-fns'],
          },
        },
      },
    },
  };
});
