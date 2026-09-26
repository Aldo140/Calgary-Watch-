import { SiteLayout } from '../components/site/SiteLayout';
import { useLivePulse } from '../hooks/useLivePulse';
import { Closing, CommunityHero, MondayEmail, Questions, ReadingReports, Sources, Steps } from '../components/community/CommunityBoard';
import '../styles/community.css';
import '../styles/community-page.css';

/** Site-wide reach the owner reports; update here when it changes. */
const VIEWS = '80K+';

export default function CommunityPage() {
  const pulse = useLivePulse(true);
  return (
    <SiteLayout>
      <div className="cv">
        <CommunityHero pulse={pulse} views={VIEWS} />
        <Sources pulse={pulse} />
        <Steps />
        <ReadingReports />
        <MondayEmail />
        <Questions />
        <Closing />
      </div>
    </SiteLayout>
  );
}
