import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  const envBase = process.env.VITE_BASE_PATH?.trim();

  // Always use root "/" unless explicitly overridden
  const base =
    envBase && envBase.length > 0
      ? envBase.endsWith('/')
        ? envBase
        : `${envBase}/`
      : '/';

  return {
    base,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    // MapLibre's Vite worker URL must be emitted by the worker pipeline rather
    // than folded into the dependency optimizer, or a fresh dev install can
    // briefly point at a worker file that does not exist.
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 700,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'vendor-leaflet': ['leaflet'],
            'vendor-recharts': ['recharts'],
            'vendor-animation': ['motion/react', 'vaul'],
            'vendor-date': ['date-fns'],
          },
        },
      },
    },
  };
});
