import { useState, useEffect, type ComponentType, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { 
  useTrendingStories, 
  type TrendingStory 
} from '@/src/hooks/useTrendingStories';
import { 
  Waves, 
  PawPrint, 
  Building2, 
  Compass, 
  Hammer, 
  Milestone, 
  Bike, 
  ShieldCheck, 
  MapPin, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  ExternalLink, 
  X,
  ArrowUpRight,
  Flame,
  ChevronRight,
  Radio
} from 'lucide-react';

interface NeighborhoodConfig {
  icon: ComponentType<{ size?: number; className?: string }>;
  accentColor: string;
  quadrant: 'NW' | 'NE' | 'SW' | 'SE';
}

const NEIGHBORHOOD_MAP: Record<string, NeighborhoodConfig> = {
  'Inglewood': { icon: Waves, accentColor: '#FF6B6B', quadrant: 'SE' },
  'Kensington': { icon: PawPrint, accentColor: '#00C2E0', quadrant: 'NW' },
  'Beltline': { icon: Building2, accentColor: '#3B82F6', quadrant: 'SW' },
  'Nose Hill': { icon: Compass, accentColor: '#10B981', quadrant: 'NW' },
  'Ramsay': { icon: Hammer, accentColor: '#F59E0B', quadrant: 'SE' },
  'Bridgeland': { icon: Milestone, accentColor: '#8B5CF6', quadrant: 'NE' },
  'Bowness': { icon: Bike, accentColor: '#059669', quadrant: 'NW' },
  'Marda Loop': { icon: ShieldCheck, accentColor: '#EC4899', quadrant: 'SW' },
};

function getNeighborhoodConfig(neighborhood: string): NeighborhoodConfig {
  return NEIGHBORHOOD_MAP[neighborhood] || {
    icon: MapPin,
    accentColor: '#FFDF4F',
    quadrant: 'SW'
  };
}

function NeighborhoodBadge({ 
  neighborhood, 
  quadrant, 
  accentColor, 
  icon: Icon 
}: {
  neighborhood: string;
  quadrant: string;
  accentColor: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <span 
      className="cw-neighborhood-badge" 
      style={{ '--badge-accent': accentColor } as CSSProperties}
    >
      <span className="cw-badge-icon" aria-hidden="true">
        <Icon size={13} />
      </span>
      <span className="cw-badge-name">{neighborhood}</span>
      <span className="cw-badge-quad">{quadrant}</span>
    </span>
  );
}

export function NeighborhoodTrendingStories() {
  const {
    stories,
    heroStory,
    listStories,
    selectedNeighborhood,
    setSelectedNeighborhood,
  } = useTrendingStories();

  const [activeStoryModal, setActiveStoryModal] = useState<TrendingStory | null>(null);

  useEffect(() => {
    if (!activeStoryModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveStoryModal(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStoryModal]);

  const filterTabs = [
    { id: 'all', label: 'All Calgary', icon: Sparkles },
    { id: 'Inglewood', label: 'Inglewood', icon: Waves },
    { id: 'Kensington', label: 'Kensington', icon: PawPrint },
    { id: 'Beltline', label: 'Beltline', icon: Building2 },
    { id: 'Nose Hill', label: 'Nose Hill', icon: Compass },
    { id: 'Ramsay', label: 'Ramsay', icon: Hammer },
    { id: 'Bridgeland', label: 'Bridgeland', icon: Milestone },
    { id: 'Bowness', label: 'Bowness', icon: Bike },
  ];

  const heroConfig = heroStory ? getNeighborhoodConfig(heroStory.neighborhood) : null;

  return (
    <section className="cw-trending-section" aria-labelledby="cw-trending-heading">
      <div className="cw-wrap">
        {/* Streamlined Editorial Header */}
        <div className="cw-trending-lead">
          <div className="cw-trending-badge">
            <span className="cw-radar-dot" aria-hidden="true" />
            <span>NEIGHBOURHOOD DISPATCH</span>
          </div>
          <h2 id="cw-trending-heading">
            Trending in your corner <em>of the city.</em>
          </h2>
          <p>
            What is actually moving on Calgary streets right now—from Bow River flow advisories to 
            verified community notices filed by your neighbours.
          </p>
        </div>

        {/* Minimalist, Tactile Filter Tabs */}
        <nav className="cw-trending-filter-strip" aria-label="Filter stories by Calgary neighbourhood">
          {filterTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = selectedNeighborhood === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`cw-trending-tab ${isActive ? 'cw-trending-tab-active' : ''}`}
                onClick={() => setSelectedNeighborhood(tab.id)}
              >
                <Icon size={14} className="cw-tab-icon" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Stories Presentation */}
        {stories.length === 0 ? (
          <div className="cw-empty-stories">
            <MapPin size={32} />
            <h3>No active reports for this neighbourhood</h3>
            <p>Select "All Calgary" to explore verified community reports across every quadrant.</p>
            <button 
              type="button" 
              className="cw-button cw-button-primary"
              onClick={() => setSelectedNeighborhood('all')}
            >
              Show All Stories
            </button>
          </div>
        ) : (
          <div className="cw-trending-layout">
            {/* Top Trending Hero Story Card */}
            {heroStory && heroConfig && (
              <article 
                className="cw-story-hero"
                onClick={() => setActiveStoryModal(heroStory)}
                tabIndex={0}
                role="button"
                aria-label={`Read top story: ${heroStory.title}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActiveStoryModal(heroStory); }}
              >
                <div className="cw-washi-tape" aria-hidden="true" />
                <div className="cw-postmark-stamp cw-postmark-hero" aria-hidden="true">
                  <span>YYC SENSOR</span>
                  <b>05BH004</b>
                </div>

                <div className="cw-story-hero-art">
                  <img 
                    src={heroStory.image} 
                    alt={heroStory.title} 
                    loading="lazy" 
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/images/hero/calgarywatch-live-watch-v1.webp'; }}
                  />
                  <div className="cw-story-hero-overlay" />
                  <span className="cw-story-rank-stamp">
                    <Flame size={12} /> #1 ON THE RADAR
                  </span>
                  <div className="cw-story-hero-badge-wrap">
                    <NeighborhoodBadge 
                      neighborhood={heroStory.neighborhood}
                      quadrant={heroStory.quadrant}
                      accentColor={heroConfig.accentColor}
                      icon={heroConfig.icon}
                    />
                  </div>
                </div>

                <div className="cw-story-hero-content">
                  <div className="cw-story-meta">
                    <span className={`cw-source-badge ${heroStory.sourceType === 'official' ? 'cw-badge-official' : 'cw-badge-community'}`}>
                      {heroStory.sourceType === 'official' ? (
                        <>
                          <Radio size={12} />
                          <span className="cw-sensor-equalizer" aria-hidden="true"><span /><span /><span /><span /></span>
                        </>
                      ) : <CheckCircle2 size={12} />}
                      {heroStory.sourceName}
                    </span>
                    <span className="cw-story-time"><Clock size={12} /> {heroStory.timeAgo}</span>
                  </div>

                  <h3>{heroStory.title}</h3>
                  <p>{heroStory.summary}</p>

                  {heroStory.timeline.length > 0 && (
                    <div className="cw-story-timeline-teaser">
                      <span className="cw-timeline-label">LATEST DISPATCH:</span>
                      <p>
                        <strong>{heroStory.timeline[heroStory.timeline.length - 1]?.time}:</strong> {heroStory.timeline[heroStory.timeline.length - 1]?.note}
                      </p>
                    </div>
                  )}

                  <div className="cw-story-footer">
                    <div className="cw-verified-badge">
                      <CheckCircle2 size={14} />
                      <span>{heroStory.verifiedCount} Neighbours Confirmed</span>
                    </div>
                    <span className="cw-read-story-btn">
                      Read Full Story <ArrowUpRight size={16} />
                    </span>
                  </div>
                </div>
              </article>
            )}

            {/* Grid of Companion Trending Stories */}
            <div className="cw-stories-grid">
              {listStories.slice(0, 4).map((story) => {
                const config = getNeighborhoodConfig(story.neighborhood);
                return (
                  <article 
                    key={story.id} 
                    className="cw-story-card"
                    onClick={() => setActiveStoryModal(story)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Read story: ${story.title}`}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActiveStoryModal(story); }}
                  >
                    <div className="cw-washi-tape cw-washi-card" aria-hidden="true" />
                    <div className="cw-postmark-stamp" aria-hidden="true">
                      {story.sourceType === 'official' ? (
                        <><span>TELEMETRY</span><b>ACTIVE</b></>
                      ) : (
                        <><span>COMMUNITY</span><b>VERIFIED</b></>
                      )}
                    </div>

                    <div className="cw-story-card-header">
                      <NeighborhoodBadge 
                        neighborhood={story.neighborhood}
                        quadrant={story.quadrant}
                        accentColor={config.accentColor}
                        icon={config.icon}
                      />
                      <span className="cw-story-card-time">{story.timeAgo}</span>
                    </div>

                    <h4>{story.title}</h4>
                    <p>{story.summary}</p>

                    <div className="cw-story-card-footer">
                      <span className={`cw-source-badge-sm ${story.sourceType === 'official' ? 'cw-badge-official' : 'cw-badge-community'}`}>
                        {story.sourceType === 'official' && (
                          <span className="cw-sensor-equalizer cw-sensor-sm" aria-hidden="true"><span /><span /><span /></span>
                        )}
                        {story.sourceName}
                      </span>
                      <span className="cw-card-action">
                        <span>Read details</span>
                        <ChevronRight size={14} />
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {/* Streamlined Community CTA Strip */}
        <div className="cw-trending-cta-strip">
          <div className="cw-trending-cta-left">
            <span className="cw-cta-dot" aria-hidden="true" />
            <p>
              <strong>Notice something happening on your block?</strong>{' '}
              Help your neighbours stay informed with a 60-second verified report.
            </p>
          </div>
          <div className="cw-trending-cta-links">
            <Link to="/map?action=report" className="cw-button cw-button-primary">
              Share a Report <ArrowUpRight size={15} />
            </Link>
            <Link to="/map" className="cw-button cw-button-secondary">
              Open Live Radar Map ↗
            </Link>
          </div>
        </div>
      </div>

      {/* Accessible Interactive Story Detail Modal */}
      {activeStoryModal && (() => {
        const modalConfig = getNeighborhoodConfig(activeStoryModal.neighborhood);
        return (
          <div 
            className="cw-modal-backdrop" 
            onClick={() => setActiveStoryModal(null)}
            role="presentation"
          >
            <div 
              className="cw-modal-panel" 
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="cw-story-modal-title"
            >
              <button 
                type="button" 
                className="cw-modal-close" 
                onClick={() => setActiveStoryModal(null)}
                aria-label="Close story"
              >
                <X size={20} />
              </button>

              <div className="cw-modal-header">
                <div className="cw-modal-badges">
                  <NeighborhoodBadge 
                    neighborhood={activeStoryModal.neighborhood}
                    quadrant={activeStoryModal.quadrant}
                    accentColor={modalConfig.accentColor}
                    icon={modalConfig.icon}
                  />
                  <span className={`cw-source-badge ${activeStoryModal.sourceType === 'official' ? 'cw-badge-official' : 'cw-badge-community'}`}>
                    {activeStoryModal.sourceName}
                  </span>
                  <span className="cw-status-pill">
                    ● Status: {activeStoryModal.status.toUpperCase()}
                  </span>
                </div>
                <h3 id="cw-story-modal-title">{activeStoryModal.title}</h3>
                <div className="cw-modal-meta">
                  <span><Clock size={13} /> Published {activeStoryModal.timeAgo}</span>
                  <span><MapPin size={13} /> {activeStoryModal.neighborhood}, Calgary</span>
                  <span><CheckCircle2 size={13} /> {activeStoryModal.verifiedCount} Neighbours Confirmed</span>
                </div>
              </div>

              <div className="cw-modal-body">
                <div className="cw-modal-lead">
                  <p>{activeStoryModal.fullReport}</p>
                </div>

                {/* Verified Chronological Timeline */}
                <div className="cw-modal-timeline">
                  <h4><Clock size={16} /> Verified Story Timeline</h4>
                  <div className="cw-timeline-track">
                    {activeStoryModal.timeline.map((item, index) => (
                      <div key={index} className="cw-timeline-step">
                        <div className="cw-timeline-step-dot" />
                        <div className="cw-timeline-step-content">
                          <div className="cw-timeline-step-header">
                            <b>{item.time}</b>
                            <span>{item.actor}</span>
                          </div>
                          <p>{item.note}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tags & Official Source Provenance */}
                <div className="cw-modal-provenance">
                  <div className="cw-modal-tags">
                    {activeStoryModal.tags.map(tag => (
                      <span key={tag} className="cw-tag-pill">#{tag}</span>
                    ))}
                  </div>

                  {activeStoryModal.sourceUrl && (
                    <a 
                      href={activeStoryModal.sourceUrl} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="cw-provenance-link"
                    >
                      View Official City Source Record <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>

              <div className="cw-modal-footer">
                <Link 
                  to={`/map?lat=${activeStoryModal.coordinates.lat}&lng=${activeStoryModal.coordinates.lng}`}
                  className="cw-button cw-button-primary"
                  onClick={() => setActiveStoryModal(null)}
                >
                  Inspect on Live Radar Map <ArrowUpRight size={17} />
                </Link>
                <Link 
                  to="/community"
                  className="cw-text-link"
                  onClick={() => setActiveStoryModal(null)}
                >
                  See All Reports in Community Watch ↗
                </Link>
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
