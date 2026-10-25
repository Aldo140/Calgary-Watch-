import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun,
  ExternalLink, Haze, Moon, Plus, Siren, Snowflake, Sun, ThermometerSnowflake, ThermometerSun, TriangleAlert, Waves, Wind, X,
} from 'lucide-react';
import {
  ALERT_KIND_LABEL, ALERT_TIPS, alertAreaLabel, alertUntilLabel,
  type AlertHazard, type MapAlert,
} from '@/src/lib/mapAlerts';
import { shortAgo } from '@/src/lib/nowBriefing';
import { useCalgaryWeather } from '@/src/hooks/useCalgaryWeather';
import { describeSky, type SkyIcon } from '@/src/lib/weatherCodes';
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
 * Small-phone alert: one round badge in the top bar instead of a full-width
 * strip, coloured by how serious the top alert is, with the count of alerts.
 */
export function AlertBadge({ alerts, onOpen }: { alerts: MapAlert[]; onOpen: (index: number) => void }) {
  const top = alerts[0];
  if (!top) return null;
  return (
    <button
      type="button"
      className="lv-abadge"
      data-kind={top.kind}
      onClick={() => onOpen(0)}
      aria-label={`${ALERT_KIND_LABEL[top.kind]}: ${top.title}${alerts.length > 1 ? `, and ${alerts.length - 1} more` : ''}. Open city alerts`}
    >
      <AlertIcon alert={top} size={16} />
      {alerts.length > 1 && <span className="lv-abadge-n" aria-hidden="true">{alerts.length}</span>}
    </button>
  );
}

const SKY_ICON: Record<SkyIcon, typeof Sun> = {
  sun: Sun, moon: Moon, partly: CloudSun, cloud: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: Snowflake, storm: CloudLightning,
};

/** Plans worth making around the weather, by hazard: the nudge toward /events. */
const PLAN_LINE: Record<AlertHazard, string> = {
  snow: 'Snowed in? Find something indoors this week.',
  ice: 'Skip the slick sidewalks: indoor plans this week.',
  rain: 'Rainy-day plans this week.',
  storm: 'Wait it out somewhere good: indoor plans this week.',
  wind: 'Out of the wind: indoor plans this week.',
  cold: 'Warm up somewhere: indoor plans this week.',
  heat: 'Cool off: shade, water and indoor plans this week.',
  smoke: 'Clean-air plans indoors this week.',
  flood: 'Away from the river: plans this week.',
  fog: 'Plans this week, once it lifts.',
  general: 'See what’s on in Calgary this week.',
};

/** Calgary-clock date key for `daily`, matching useCalgaryWeather. */
function dayKey(t: number): string {
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' });
}

/**
 * Where the alert is in its life: issued, now, until. Only drawn when the
 * alert carries an end time; the bar never guesses one.
 */
function AlertTimeline({ issuedAt, expiresAt, now }: { issuedAt: number; expiresAt?: number; now: number }) {
  if (!expiresAt || expiresAt <= issuedAt || expiresAt <= now) return null;
  const pct = Math.min(100, Math.max(4, ((now - issuedAt) / (expiresAt - issuedAt)) * 100));
  const left = expiresAt - now;
  const mins = Math.max(1, Math.round(left / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const remain = h >= 24 ? `${Math.round(h / 24)} d` : h > 0 ? `${h} h ${m ? `${m} min` : ''}`.trim() : `${m} min`;
  return (
    <div className="lv-atime" aria-label={`In effect for about ${remain} more`}>
      <div className="lv-atime-top">
        <span>Issued {shortAgo(issuedAt, now)}</span>
        <b>{remain} left</b>
      </div>
      <div className="lv-atime-bar" aria-hidden="true">
        <span className="lv-atime-fill" style={{ width: `${pct}%` }} />
        <span className="lv-atime-now" style={{ left: `${pct}%` }}><i>Now</i></span>
      </div>
      <div className="lv-atime-top lv-atime-end"><span /> <span>{alertUntilLabel(expiresAt, now)}</span></div>
    </div>
  );
}

/**
 * What it's like right now, and the next three days: the same Open-Meteo
 * reading the homepage uses. Mounted only while the card is open, and drawn
 * only once real numbers arrive; on failure the card simply goes without.
 */
function RightNow({ now }: { now: number }) {
  const wx = useCalgaryWeather();
  if (wx.status !== 'ready' || !wx.current) return null;
  const sky = describeSky(wx.current.code, wx.current.isDay);
  const NowIcon = SKY_ICON[sky.icon];
  const days = [1, 2, 3]
    .map((k) => { const t = now + k * 86_400_000; return { t, d: wx.daily[dayKey(t)] }; })
    .filter((x) => x.d);
  return (
    <section className="lv-anow" aria-label="Right now in Calgary">
      <div className="lv-anow-main">
        <span className="lv-anow-ico" aria-hidden="true"><NowIcon size={30} strokeWidth={2.2} /></span>
        <span className="lv-anow-temp">{Math.round(wx.current.temp)}°</span>
        <span className="lv-anow-txt">
          <small>Right now in Calgary</small>
          <b>{sky.label}</b>
          <em>Wind {Math.round(wx.current.windKph)} km/h</em>
        </span>
      </div>
      {days.length > 0 && (
        <ul className="lv-anow-days">
          {days.map(({ t, d }) => {
            const DayIcon = SKY_ICON[describeSky(d!.code).icon];
            return (
              <li key={t}>
                <small>{new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Edmonton', weekday: 'short' })}</small>
                <DayIcon size={18} strokeWidth={2.2} aria-hidden="true" />
                <b>{Math.round(d!.max)}°<span> / {Math.round(d!.min)}°</span></b>
                {d!.precipChance !== null && d!.precipChance >= 20 && <em>{d!.precipChance}%</em>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="lv-anow-src">Open-Meteo forecast model</p>
    </section>
  );
}

/**
 * The alert card: a full sky that matches the hazard with the alert's name on
 * it, how long it has left, what it's like right now, what to do, a nudge
 * toward plans that suit the weather, and who issued it. Several alerts page
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
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="lv-asheet-body">
              <div className="lv-asky">
                <span className="lv-asky-fx" aria-hidden="true" />
                <span className="lv-asky-fx lv-asky-fx2" aria-hidden="true" />
                <span className="lv-asky-grabber" aria-hidden="true" />
                <button type="button" className="lv-asheet-x" onClick={onClose} aria-label="Close city alerts">
                  <X size={18} strokeWidth={2.6} />
                </button>
                <span className="lv-asky-badge" aria-hidden="true"><AlertIcon alert={alert} size={38} /></span>
                <p className="lv-asheet-eyebrow">
                  <span className="lv-asheet-tag" data-kind={alert.kind}>{ALERT_KIND_LABEL[alert.kind]}</span>
                  <span>{alertAreaLabel(alert.areas)}</span>
                </p>
                <h2 id={titleId} className="lv-asheet-title">{alert.title}</h2>
                <p className="lv-asky-src">{alert.source}</p>
              </div>

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

              <div className="lv-asheet-main">
                <AlertTimeline issuedAt={alert.issuedAt} expiresAt={alert.expiresAt} now={now} />
                {!alert.expiresAt && (
                  <ul className="lv-asheet-meta">
                    <li>{alert.kind === 'conditions' ? 'Updated' : 'Issued'} {shortAgo(alert.issuedAt, now)}</li>
                  </ul>
                )}

                <div className="lv-asheet-text">
                  {alert.body.split(/\n{2,}/).slice(0, 4).map((p, k) => <p key={k}>{p}</p>)}
                </div>

                <RightNow now={now} />

                <section className="lv-ado" aria-label="What to do">
                  <h3 className="lv-asheet-h">What to do</h3>
                  <ol className="lv-asheet-tips">
                    {ALERT_TIPS[alert.hazard].map((t, k) => (
                      <li key={t}><span aria-hidden="true">{k + 1}</span><p>{t}</p></li>
                    ))}
                  </ol>
                </section>

                {alert.kind === 'conditions' && (
                  <p className="lv-asheet-fine">
                    A forecast model's reading of current conditions, not an issued warning. Environment Canada warnings show here when they are in effect.
                  </p>
                )}

                {onReport && alert.kind !== 'emergency' && (
                  <button type="button" className="lv-asheet-report" onClick={() => { onClose(); onReport(); }}>
                    <span className="lv-asheet-report-ico" aria-hidden="true"><Plus size={20} strokeWidth={2.8} /></span>
                    <span>
                      <b>Seeing it on your street?</b>
                      <small>Post what it's like where you are</small>
                    </span>
                    <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
                  </button>
                )}

                {alert.kind !== 'emergency' && (
                  <a className="lv-aplans" href="/events">
                    <span className="lv-aplans-ico" aria-hidden="true"><CalendarDays size={18} strokeWidth={2.6} /></span>
                    <span><small>Plans this week</small><b>{PLAN_LINE[alert.hazard]}</b></span>
                    <ArrowRight size={18} strokeWidth={2.6} aria-hidden="true" />
                  </a>
                )}

                {alert.sourceUrl && (
                  <a className="lv-asheet-src" href={alert.sourceUrl} target="_blank" rel="noopener noreferrer">
                    Read the full alert from {alert.source} <ExternalLink size={14} />
                  </a>
                )}

                <p className="lv-asheet-why">
                  City alerts cover a whole area, so they live here instead of as pins. The map stays for what neighbours, police and local news report.
                </p>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
