import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Stamps each build with an id: a <meta name="cw-build"> in the HTML and
 * /version.json, so an open tab can tell a deploy happened (src/lib/appVersion.ts).
 * It stays out of the JS on purpose: a value in the entry chunk changes every
 * chunk's hash on every build, which is the churn that breaks open tabs.
 * Scheduled rebuilds reuse the commit but change the data chunks, so the id
 * carries the build time too.
 */
const BUILD_ID = `${(process.env.GITHUB_SHA || 'local').slice(0, 7)}-${Date.now().toString(36)}`;

function buildVersionFile(): Plugin {
  return {
    name: 'cw-build-version',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'cw-build', content: BUILD_ID }, injectTo: 'head' }];
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, builtAt: new Date().toISOString() }) + '\n' });
    },
  };
}

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
    plugins: [react(), tailwindcss(), buildVersionFile()],
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
