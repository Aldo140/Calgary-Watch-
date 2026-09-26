import { useMemo, useState } from 'react';
import { SiteLayout } from '../components/site/SiteLayout';
import { HomeHero } from '../components/home/HomeHero';
import { WeekPlanner } from '../components/home/WeekPlanner';
import { LiveNow } from '../components/home/LiveNow';
import { WhatsHere } from '../components/home/WhatsHere';
import { useLivePulse } from '../hooks/useLivePulse';
import { QuadrantMap } from '../components/home/QuadrantMap';
import { SlowerPlans, MondayDigest } from '../components/home/SlowerPlans';
import { CalgaryDailyStrip } from '../components/home/CalgaryDailyStrip';
import { useCalgaryWeather } from '../hooks/useCalgaryWeather';
import { weekAgenda } from '../lib/discoveryCalendar';
import { discoveryRepository } from '../data/discovery';
import '../styles/home.css';
import '../styles/home-board.css';

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
  const pulse = useLivePulse(true);
  const [selected, setSelected] = useState(() => Math.max(0, days.findIndex(d => d.items.length)));

  const pickDay = (index: number) => {
    setSelected(index);
    document.getElementById('week')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <SiteLayout>
      <div className="cw-home2">
        <HomeHero days={days} weather={weather} onPickDay={pickDay} />
        <div className="cw-wrap h-ways-wrap">
          <WhatsHere days={days} entities={entities} pulse={pulse} />
        </div>
        <div className="cw-wrap h-week-wrap">
          <WeekPlanner days={days} forecast={weather.daily} selected={selected} onSelect={setSelected} />
        </div>
        <LiveNow weather={weather} pulse={pulse} />
        <div className="cw-wrap h-body">
          <QuadrantMap entities={entities} />
          <SlowerPlans entities={entities} />
          <CalgaryDailyStrip />
          <MondayDigest />
        </div>
      </div>
    </SiteLayout>
  );
}
