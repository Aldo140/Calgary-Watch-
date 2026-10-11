import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, X } from 'lucide-react';
import '../../styles/notice.css';

/**
 * The one look for every card that floats over a page: the homepage's own
 * ink-edged card with an offset shadow, an eyebrow row that carries the
 * close button (so it never floats over the copy), a short value line, and
 * one clear action beside a quiet "Not now".
 *
 * `tone` picks the homepage card it borrows from: `live` is the navy
 * Community Watch card, `sun` the yellow "Make Calgary yours" card.
 */
export function Notice({ tone, eyebrow, title, text, points, art, action, onClose, leaving, labelId }: {
  tone: 'live' | 'sun';
  eyebrow: ReactNode;
  title: ReactNode;
  text: ReactNode;
  points?: string[];
  art: ReactNode;
  action: { to: string; label: string; onClick?: () => void };
  onClose: () => void;
  leaving: boolean;
  labelId: string;
}) {
  return (
    <aside className="cw-notice" data-tone={tone} data-leaving={leaving} aria-labelledby={labelId}>
      <div className="cw-notice-top">
        <p className="cw-notice-eyebrow"><span aria-hidden="true" />{eyebrow}</p>
        <button type="button" className="cw-notice-close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>
      <div className="cw-notice-main">
        <div className="cw-notice-art" aria-hidden="true">{art}</div>
        <h2 id={labelId} className="cw-notice-title">{title}</h2>
      </div>
      <p className="cw-notice-text">{text}</p>
      {points?.length ? (
        <ul className="cw-notice-points">{points.map((p) => <li key={p}>{p}</li>)}</ul>
      ) : null}
      <div className="cw-notice-actions">
        <Link to={action.to} className="cw-notice-go" onClick={action.onClick}>
          {action.label} <ArrowUpRight size={16} strokeWidth={2.5} aria-hidden="true" />
        </Link>
        <button type="button" className="cw-notice-later" onClick={onClose}>Not now</button>
      </div>
    </aside>
  );
}
