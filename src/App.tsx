/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import SeoManager from '@/src/components/SeoManager';
import { db } from '@/src/firebase';
import { collection, addDoc } from 'firebase/firestore';

// Lazy-load every page so the initial bundle stays minimal and module-eval
// failures (e.g. GSAP/Leaflet on Safari) are isolated to their own chunk.
const LandingPage = lazy(() => import('@/src/pages/LandingPage'));
const MapPage     = lazy(() => import('@/src/pages/MapPage'));
const AboutPage   = lazy(() => import('@/src/pages/AboutPage'));
const AdminPage   = lazy(() => import('@/src/pages/AdminPage'));

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

/**
 * PageTracker — enhanced analytics document written to `page_views` on every
 * unique pathname visit.  Fields collected:
 *   path         – current pathname
 *   referrer     – document.referrer (empty string when none)
 *   utm_source   – ?utm_source param, if present
 *   utm_medium   – ?utm_medium param, if present
 *   utm_campaign – ?utm_campaign param, if present
 *   traffic_source – bucketed label derived from referrer / UTM
 *   sessionId    – stable per-tab random ID (stored in sessionStorage)
 *   timestamp    – Unix ms
 */
function PageTracker() {
  const location = useLocation();
  useEffect(() => {
    if (!db || location.pathname === '/admin') return;

    // ── Session ID ──────────────────────────────────────────────────────────
    // Stable for the browser tab's lifetime; regenerated on new tab/session.
    let sessionId = sessionStorage.getItem('cw_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('cw_session_id', sessionId);
    }

    // ── UTM params ──────────────────────────────────────────────────────────
    const searchParams = new URLSearchParams(location.search);
    const utm_source   = searchParams.get('utm_source')   ?? '';
    const utm_medium   = searchParams.get('utm_medium')   ?? '';
    const utm_campaign = searchParams.get('utm_campaign') ?? '';

    // ── Traffic source bucket ────────────────────────────────────────────────
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    let traffic_source = 'direct';
    if (utm_source) {
      traffic_source = utm_source.toLowerCase().includes('email')
        ? 'email'
        : utm_medium === 'social' || ['facebook','twitter','instagram','linkedin','tiktok'].includes(utm_source.toLowerCase())
          ? 'social'
          : 'campaign';
    } else if (referrer) {
      try {
        const refHost = new URL(referrer).hostname.replace(/^www\./, '');
        if (['google.com','bing.com','duckduckgo.com','yahoo.com','ecosia.org'].some(s => refHost.includes(s))) {
          traffic_source = 'organic_search';
        } else if (['facebook.com','twitter.com','x.com','instagram.com','linkedin.com','reddit.com','tiktok.com'].some(s => refHost.includes(s))) {
          traffic_source = 'social';
        } else if (refHost !== window.location.hostname.replace(/^www\./, '')) {
          traffic_source = 'referral';
        }
      } catch {}
    }

    addDoc(collection(db, 'page_views'), {
      timestamp: Date.now(),
      path: location.pathname,
      referrer,
      utm_source,
      utm_medium,
      utm_campaign,
      traffic_source,
      sessionId,
    }).catch(() => {});
  }, [location.pathname]);
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
      <PageTracker />
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