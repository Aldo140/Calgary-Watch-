/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import LandingPage from '@/src/pages/LandingPage';
import MapPage from '@/src/pages/MapPage';
import SeoManager from '@/src/components/SeoManager';

// Lazy-load heavy pages so the initial JS bundle stays small.
const AboutPage = lazy(() => import('@/src/pages/AboutPage'));
const AdminPage = lazy(() => import('@/src/pages/AdminPage'));

/**
 * Handles redirects from the 404.html hack.
 * This checks for the 'p' parameter in the URL and navigates to the correct internal route.
 */
function RedirectHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const redirectPath = params.get('p');
    
    if (redirectPath) {
      // Convert the path back from the ~and~ encoding if used in your 404 script
      const cleanPath = redirectPath.replace(/~and~/g, '/');
      window.history.replaceState(null, '', cleanPath);
    }
  }, []);

  return null;
}

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
  return (
    <BrowserRouter>
      <RedirectHandler />
      <SeoManager />
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
    </BrowserRouter>
  );
}