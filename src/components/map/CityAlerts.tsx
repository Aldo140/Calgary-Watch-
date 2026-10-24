import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, ChevronLeft, ChevronRight, CloudFog, CloudLightning, CloudRain, CloudSun, ExternalLink, Haze,
  Plus, Siren, Snowflake, ThermometerSnowflake, ThermometerSun, TriangleAlert, Waves, Wind, X,
} from 'lucide-react';
import {
  ALERT_KIND_LABEL, ALERT_TIPS, alertAreaLabel, alertUntilLabel,
  type AlertHazard, type MapAlert,
} from '@/src/lib/mapAlerts';
import { shortAgo } from '@/src/lib/nowBriefing';
import '@/src/styles/map-alerts.css';

const HAZARD_ICON: Record<AlertHazard, typeof Snowflake> = {
  snow: Snowflake, ice: ThermometerSnowflake, rain: CloudRain, storm: CloudLightning, wind: Wind,
  cold: ThermometerSnowflake, heat: ThermometerSun, smoke: Haze, flood: Waves, fog: CloudFog, general: TriangleAlert,
};

export function AlertIcon({ alert, size = 18 }: { alert: MapAlert; size?: number }) {
  if (alert.kind === 'emergency') return <Siren size={size} strokeWidth={2.4} />;
  if (alert.kind === 'conditions' && alert.hazard === 'general') return <CloudSun size={size} strokeWidth={2.4} />;
  const Icon = HAZARD_ICON[alert.hazard];
  return <Icon size={size} strokeWidth={2.4} />;
}

/**
 * The one-line alert strip. Shows the most serious alert and how many more
 * there are; tapping opens the alert card. Renders nothing without alerts.
 */
export function AlertStrip({
  alerts, onOpen, variant = 'phone', now,
}: {
  alerts: MapAlert[];
  onOpen: (index: number) => void;
  variant?: 'phone' | 'desk';
  now?: number;
}) {
  const top = alerts[0];
  if (!top) return null;
  const until = alertUntilLabel(top.expiresAt, now);
  const more = alerts.length - 1;
  return (
    <button
      type="button"
      className="lv-alert"
      data-kind={top.kind}
      data-variant={variant}
      onClick={() => onOpen(0)}
      aria-label={`${ALERT_KIND_LABEL[top.kind]}: ${top.title}${until ? `, ${until}` : ''}${more > 0 ? `, and ${more} more` : ''}. Open city alerts`}
    >
      <span className="lv-alert-ico" aria-hidden="true"><AlertIcon alert={top} size={15} /></span>
      <span className="lv-alert-tag" aria-hidden="true">{ALERT_KIND_LABEL[top.kind]}</span>
      <span className="lv-alert-title" aria-hidden="true">
        {top.title}
        {until && <em> · {until}</em>}
      </span>
      {more > 0 && <span className="lv-alert-more" aria-hidden="true">+{more}</span>}
      <ChevronRight size={16} strokeWidth={2.6} className="lv-alert-go" aria-hidden="true" />
    </button>
  );
}

/**
 * The alert card: a sky that matches the hazard, what the alert says, where it
 * applies and until when, what to do, and who issued it. Several alerts page
 * with the chips at the top. A bottom sheet on phones, a centred card above.
 */
export function AlertSheet({
  alerts, index, onIndex, onClose, onReport, now: fixedNow,
}: {
  alerts: MapAlert[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** "Seeing it on your street?": a neighbour's own weather report stays a report. */
  onReport?: () => void;
  now?: number;
}) {
  const titleId = useId();
  const open = index !== null && alerts.length > 0;
  const i = open ? Math.min(index!, alerts.length - 1) : 0;
  const alert = open ? alerts[i] : null;
  const [now] = useState(() => fixedNow ?? Date.now());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowRight' && alerts.length > 1) onIndex((i + 1) % alerts.length);
      if (e.key === 'ArrowLeft' && alerts.length > 1) onIndex((i - 1 + alerts.length) % alerts.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, i, alerts.length, onClose, onIndex]);

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          key="city-alerts"
          className="lv-asheet-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button type="button" className="lv-asheet-scrim" aria-label="Close city alerts" onClick={onClose} />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="lv-asheet"
            data-kind={alert.kind}
            data-hazard={alert.hazard}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lv-asky" aria-hidden="true">
              <span className="lv-asky-fx" />
              <span className="lv-asky-fx lv-asky-fx2" />
              <span className="lv-asky-badge"><AlertIcon alert={alert} size={40} /></span>
            </div>
            <button type="button" className="lv-asheet-x" onClick={onClose} aria-label="Close city alerts">
              <X size={18} strokeWidth={2.6} />
            </button>

            {alerts.length > 1 && (
              <div className="lv-apager" role="tablist" aria-label="City alerts">
                <button type="button" className="lv-apager-step" aria-label="Previous alert" onClick={() => onIndex((i - 1 + alerts.length) % alerts.length)}>
                  <ChevronLeft size={16} strokeWidth={2.6} />
                </button>
                <div className="lv-apager-chips">
                  {alerts.map((a, k) => (
                    <button
                      key={a.id}
                      type="button"
                      role="tab"
                      aria-selected={k === i}
                      data-kind={a.kind}
                      className="lv-apager-chip"
                      onClick={() => onIndex(k)}
                    >
                      <AlertIcon alert={a} size={13} />
                      <span>{a.title}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="lv-apager-step" aria-label="Next alert" onClick={() => onIndex((i + 1) % alerts.length)}>
                  <ChevronRight size={16} strokeWidth={2.6} />
                </button>
              </div>
            )}

            <div className="lv-asheet-body">
              <p className="lv-asheet-eyebrow">
                <span className="lv-asheet-tag" data-kind={alert.kind}>{ALERT_KIND_LABEL[alert.kind]}</span>
                {alert.source}
              </p>
              <h2 id={titleId} className="lv-asheet-title">{alert.title}</h2>
              <ul className="lv-asheet-meta">
                <li>{alertAreaLabel(alert.areas)}</li>
                <li>{alert.kind === 'conditions' ? 'Updated' : 'Issued'} {shortAgo(alert.issuedAt, now)}</li>
                {alertUntilLabel(alert.expiresAt, now) && <li>{alertUntilLabel(alert.expiresAt, now)}</li>}
              </ul>

              <div className="lv-asheet-text">
                {alert.body.split(/\n{2,}/).slice(0, 4).map((p, k) => <p key={k}>{p}</p>)}
              </div>

              <h3 className="lv-asheet-h">What to do</h3>
              <ul className="lv-asheet-tips">
                {ALERT_TIPS[alert.hazard].map((t) => (
                  <li key={t}><span aria-hidden="true"><Check size={13} strokeWidth={3} /></span>{t}</li>
                ))}
              </ul>

              {alert.kind === 'conditions' && (
                <p className="lv-asheet-fine">
                  A forecast model's reading of current conditions, not an issued warning. Environment Canada warnings show here when they are in effect.
                </p>
              )}

              <div className="lv-asheet-actions">
                {onReport && alert.kind !== 'emergency' && (
                  <button type="button" className="lv-asheet-report" onClick={() => { onClose(); onReport(); }}>
                    <Plus size={17} strokeWidth={2.8} />
                    <span>
                      <b>Seeing it on your street?</b>
                      <small>Post what it's like where you are</small>
                    </span>
                  </button>
                )}
                {alert.sourceUrl && (
                  <a className="lv-asheet-src" href={alert.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Full alert <ExternalLink size={14} />
                  </a>
                )}
              </div>

              <p className="lv-asheet-why">
                City alerts cover a whole area, so they live here instead of as pins. The map stays for what neighbours, police and local news report.
              </p>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
