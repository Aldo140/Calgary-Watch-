/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom';
import LandingPage from '@/src/pages/LandingPage';
import MapPage from '@/src/pages/MapPage';
import AboutPage from '@/src/pages/AboutPage';
import AdminPage from '@/src/pages/AdminPage';

export default function App() {
  const isGitHubPages = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  const routes = (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/admin" element={<AdminPage />} />
      {/* Fallback to landing page */}
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );

  if (isGitHubPages) {
    // Hash routing avoids GitHub Pages 404s on deep links; no basename needed.
    return <HashRouter>{routes}</HashRouter>;
  }

  return <BrowserRouter basename={import.meta.env.BASE_URL}>{routes}</BrowserRouter>;
}
