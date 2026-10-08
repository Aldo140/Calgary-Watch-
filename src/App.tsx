/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import SeoManager from '@/src/components/SeoManager';
import { db } from '@/src/firebase';
import { collection, addDoc } from 'firebase/firestore';
import './styles/page-loader.css';

// Lazy-load every page so the initial bundle stays minimal and module-eval
// failures (e.g. GSAP/Leaflet on Safari) are isolated to their own chunk.
const LandingPage = lazy(() => import('@/src/pages/DiscoveryHomePage'));
const CommunityPage = lazy(() => import('@/src/pages/CommunityPage'));
const SubmitDiscoveryPage = lazy(() => import('@/src/pages/SubmitDiscoveryPage'));
const ClaimListingPage = lazy(() => import('@/src/pages/ClaimListingPage'));
const MarketHQPage = lazy(() => import('@/src/pages/MarketHQPage'));
const VendorApplyPage = lazy(() => import('@/src/pages/VendorApplyPage'));
const ForMarketsPage = lazy(() => import('@/src/pages/ForMarketsPage'));
const DiscoveryPage = lazy(() => import('@/src/pages/DiscoveryPage'));
const MapPage     = lazy(() => import('@/src/pages/MapPage'));
const NotFoundPage = lazy(() => import('@/src/pages/NotFoundPage'));
const AboutPage   = lazy(() => import('@/src/pages/AboutPage'));
const AdminPage   = lazy(() => import('@/src/pages/AdminPage'));
const AdminUserListPage = lazy(() => import('@/src/pages/admin/AdminUserListPage'));
const AdminIncidentListPage = lazy(() => import('@/src/pages/admin/AdminIncidentListPage'));
const CoveragePage = lazy(() => import('@/src/pages/CoveragePage'));
const PrivacyPage  = lazy(() => import('@/src/pages/PrivacyPage'));
const PartnersPage = lazy(() => import('@/src/pages/PartnersPage'));
const DateNightPage = lazy(() => import('@/src/pages/DateNightPage'));
const NeighbourhoodWatchGuidePage = lazy(() => import('@/src/pages/NeighbourhoodWatchGuidePage'));
const AirdrieCrimeMapPage = lazy(() => import('@/src/pages/AirdrieCrimeMapPage'));
const CheckYourCommunityPage = lazy(() => import('@/src/pages/CheckYourCommunityPage'));
const UnsubscribePage = lazy(() => import('@/src/pages/UnsubscribePage'));
const PlansPage = lazy(() => import('@/src/pages/PlansPage'));

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
 *   referrer     – referring HOSTNAME only, never the full URL
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
    if (!db || location.pathname.startsWith('/admin')) return;

    // ── Session ID ──────────────────────────────────────────────────────────
    // Stable for the browser tab's lifetime; regenerated on new tab/session.
    let sessionId = sessionStorage.getItem('cw_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem('cw_session_id', sessionId);
    }

    // ── UTM params ──────────────────────────────────────────────────────────
    const searchParams = new URLSearchParams(location.search);
    const utm = (key: string) => (searchParams.get(key) ?? '').slice(0, 100);
    const utm_source   = utm('utm_source');
    const utm_medium   = utm('utm_medium');
    const utm_campaign = utm('utm_campaign');

    // ── Traffic source bucket ────────────────────────────────────────────────
    // Store only the referring hostname. The full referrer URL can carry search
    // terms, session tokens, and other PII in its query string, and the admin
    // panel only ever renders the hostname anyway. Search keywords are
    // deliberately NOT captured — see the organic-search panel in AdminPage,
    // which reports them as withheld.
    const rawReferrer = typeof document !== 'undefined' ? document.referrer : '';
    let referrer = '';
    let traffic_source = 'direct';
    const aiSources = ['chatgpt', 'openai', 'claude', 'anthropic', 'perplexity', 'copilot', 'gemini'];
    if (utm_source) {
      const normalizedSource = utm_source.toLowerCase();
      traffic_source = aiSources.some(source => normalizedSource.includes(source))
        ? 'ai_referral'
        : normalizedSource.includes('email')
        ? 'email'
        : utm_medium === 'social' || ['facebook','twitter','instagram','linkedin','tiktok'].includes(normalizedSource)
          ? 'social'
          : 'campaign';
    } else if (rawReferrer) {
      try {
        const refHost = new URL(rawReferrer).hostname.replace(/^www\./, '');
        referrer = refHost.slice(0, 200);
        if (aiSources.some(source => refHost.includes(source))) {
          traffic_source = 'ai_referral';
        } else if (['google.com','bing.com','duckduckgo.com','yahoo.com','ecosia.org'].some(s => refHost.includes(s))) {
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

/**
 * Shown when a later navigation waits on a page chunk. The first load is
 * covered by the splash in index.html instead, so this stays small: the
 * CalgaryWatch "C" drawing itself on the page's own cream background.
 */
function PageLoader() {
  return (
    <div className="cw-page-loader" role="status" aria-label="Loading">
      <svg viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
        <path className="cw-page-loader-track" d="M36 11A17 17 0 1 0 38 34" />
        <path className="cw-page-loader-wave" d="M36 11A17 17 0 1 0 38 34" />
        <circle className="cw-page-loader-sun" cx="23" cy="24" r="5" />
      </svg>
    </div>
  );
}

/** Lifts the index.html splash once the first route has actually rendered. */
function SplashDone() {
  useEffect(() => {
    (window as Window & { __cwSplashDone?: () => void }).__cwSplashDone?.();
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <RedirectHandler />
      <PageTracker />
      <SeoManager />
      <Suspense fallback={<PageLoader />}>
        <SplashDone />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/submit" element={<SubmitDiscoveryPage />} />
          <Route path="/claim/:id" element={<ClaimListingPage />} />
          <Route path="/organizer/:id" element={<MarketHQPage />} />
          <Route path="/apply/:id" element={<VendorApplyPage />} />
          <Route path="/for-markets" element={<ForMarketsPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/events" element={<DiscoveryPage />} />
          <Route path="/events/:slug" element={<DiscoveryPage />} />
          <Route path="/markets" element={<DiscoveryPage />} />
          <Route path="/markets/:slug" element={<DiscoveryPage />} />
          <Route path="/local" element={<DiscoveryPage />} />
          <Route path="/local/:slug" element={<DiscoveryPage />} />
          <Route path="/guides" element={<DiscoveryPage />} />
          <Route path="/guides/:slug" element={<DiscoveryPage />} />
          <Route path="/neighbourhoods" element={<DiscoveryPage />} />
          <Route path="/neighbourhoods/:slug" element={<DiscoveryPage />} />
          <Route path="/search" element={<DiscoveryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/users" element={<AdminUserListPage />} />
          <Route path="/admin/incidents" element={<AdminIncidentListPage />} />
          <Route path="/coverage" element={<CoveragePage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/date-night" element={<DateNightPage />} />
          {/* Event interests, "I'm going", badges and the Thursday picks email. */}
          <Route path="/plans" element={<PlansPage />} />
          {/* Reached from a link in the weekly digest, always signed out. */}
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/calgary-neighbourhood-watch" element={<NeighbourhoodWatchGuidePage />} />
          <Route path="/airdrie-crime-map" element={<AirdrieCrimeMapPage />} />
          <Route path="/check-your-community" element={<CheckYourCommunityPage />} />
          {/* Redirect unknown paths to landing page */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
