import { SiteLayout } from '../components/site/SiteLayout';
import { useLivePulse } from '../hooks/useLivePulse';
import { LiveHero } from '../components/community/LiveHero';
import { Alongside, Closing, HowItWorks, MapLayers, Questions, StreetFirst, TrustAnatomy } from '../components/community/Sections';
import '../styles/community.css';
import '../styles/live-hero.css';
import '../styles/community-sections.css';

/** Site-wide reach the owner reports; update here when it changes. */
const VIEWS = '80K+';

export default function CommunityPage() {
  const pulse = useLivePulse(true);
  return (
    <SiteLayout>
      <div className="cm cx">
        <LiveHero pulse={pulse} views={VIEWS} />
        <MapLayers pulse={pulse} />
        <HowItWorks />
        <StreetFirst />
        <TrustAnatomy />
        <Alongside />
        <Questions />
        <Closing views={VIEWS} pulse={pulse} />
      </div>
    </SiteLayout>
  );
}
