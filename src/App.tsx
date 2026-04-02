/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import LandingPage from '@/src/pages/LandingPage';
import MapPage from '@/src/pages/MapPage';
import SeoManager from '@/src/components/SeoManager';

// Lazy-load heavy pages so the initial JS bundle stays small.
// These chunks are only fetched when the user navigates to that route.
const AboutPage = lazy(() => import('@/src/pages/AboutPage'));
const AdminPage = lazy(() => import('@/src/pages/AdminPage'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-[#4A90D9] border-t-transparent animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  const routes = (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/admin" element={<AdminPage />} />
        {/* Redirect unknown paths to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );

  if (isGitHubPages) {
    // Hash routing avoids GitHub Pages 404s on deep links; no basename needed.
    return (
      <HashRouter>
        <SeoManager />
        {routes}
      </HashRouter>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <SeoManager />
      {routes}
    </BrowserRouter>
  );
}
