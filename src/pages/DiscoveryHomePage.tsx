import { useMemo, useState } from 'react';
import { SiteLayout } from '../components/site/SiteLayout';
import { HomeHero } from '../components/home/HomeHero';
import { WeekPlanner } from '../components/home/WeekPlanner';
import { LiveNow } from '../components/home/LiveNow';
import { WhatsHere } from '../components/home/WhatsHere';
import { useLivePulse, type LivePulse } from '../hooks/useLivePulse';
import type { IncidentCategory } from '../types';
import { WatchPromo } from '../components/home/WatchPromo';
import { HomeYours } from '../components/home/HomeYours';
import { SlowerPlans, MondayDigest } from '../components/home/SlowerPlans';
import { CalgaryDailyStrip } from '../components/home/CalgaryDailyStrip';
import { useCalgaryWeather } from '../hooks/useCalgaryWeather';
import { weekAgenda } from '../lib/discoveryCalendar';
import { discoveryRepository } from '../data/discovery';
import '../styles/home.css';
import '../styles/home-board.css';
import '../styles/home-v3.css';

/**
 * Development only: `/?demo=live` fills the live pulse with sample pins so the
 * Community Watch radar can be previewed without Firestore. Never in a build.
 */
function withDemoPulse(pulse: LivePulse): LivePulse {
  if (!import.meta.env.DEV || typeof window === 'undefined' || new URLSearchParams(window.location.search).get('demo') !== 'live') return pulse;
  const now = Date.now();
  const spots: [string, number, number, IncidentCategory][] = [
    ['Beltline', 51.039, -114.078, 'crime'], ['Kensington', 51.053, -114.091, 'traffic'], ['Forest Lawn', 51.042, -113.964, 'crime'],
    ['Bowness', 51.09, -114.208, 'infrastructure'], ['Marda Loop', 51.023, -114.106, 'crime'], ['Shawnessy', 50.909, -114.072, 'traffic'],
    ['Inglewood', 51.037, -114.019, 'weather'], ['Tuscany', 51.125, -114.25, 'crime'], ['Airport', 51.12, -114.0, 'traffic'], ['Chinook', 50.998, -114.073, 'infrastructure'],
  ];
  const recent = spots.map(([n, lat, lng, category], i) => ({ id: `demo-${i}`, title: `Sample report in ${n}`, neighborhood: n, category, timestamp: now - i * 41 * 60000, lat, lng }));
  return { ...pulse, reports: { status: 'ready', total: recent.length, capped: false, byCategory: { crime: 4, traffic: 3, infrastructure: 2, weather: 1 }, checkedAt: now, example: recent[0], recent } };
}

/**
 * The homepage answers one question — what's happening in Calgary — in the
 * order a person asks it: this week (planner), right now (Live), then where
 * and how to spend a slower day. Inventory is organized by *time*, not by
 * entity type, so recurring markets fill the week instead of repeating across
 * three type-based sections.
 */
export default function DiscoveryHomePage() {
  const entities = discoveryRepository.list();
  const days = useMemo(() => weekAgenda(entities, discoveryRepository.occurrences()), [entities]);
  const weather = useCalgaryWeather();
  const pulse = withDemoPulse(useLivePulse(true));
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex(d => d.items.length)));

  const pickDay = (index: number) => {
    setSelected(index);
    document.getElementById('week')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <SiteLayout>
      <div className="cw-home2">
        <HomeHero days={days} weather={weather} onPickDay={pickDay} />
        <div className="cw-wrap h-yours-wrap"><HomeYours /></div>
        <div className="cw-wrap h-ways-wrap">
          <WhatsHere days={days} entities={entities} pulse={pulse} />
        </div>
        <div className="cw-wrap h-week-wrap">
          <WeekPlanner days={days} forecast={weather.daily} selected={selected} onSelect={setSelected} />
        </div>
        <LiveNow weather={weather} pulse={pulse} />
        <div className="cw-wrap h-body">
          <SlowerPlans entities={entities} />
          <CalgaryDailyStrip />
          <MondayDigest />
        </div>
      </div>
      <WatchPromo pulse={pulse} />
    </SiteLayout>
  );
}
