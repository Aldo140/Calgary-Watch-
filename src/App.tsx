/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from '@/src/pages/LandingPage';
import MapPage from '@/src/pages/MapPage';
import AboutPage from '@/src/pages/AboutPage';
import { FirebaseProvider } from '@/src/components/FirebaseProvider';

export default function App() {
  return (
    <FirebaseProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Fallback to landing page */}
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Router>
    </FirebaseProvider>
  );
}
