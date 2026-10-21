import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { errorKind, isOffline, recoverFromStaleChunk, type ErrorKind } from '@/src/lib/chunkRecovery';
import { BUILD_ID } from '@/src/lib/appVersion';
import { logProductEvent } from '@/src/lib/productEvents';
import '../styles/error-screen.css';

interface Props {
  children: ReactNode;
  /** Clears the error when this changes, e.g. the route, so Back works after a crash. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Firestore errors arrive as JSON in the message; readers get the inner text. */
function readableMessage(error: Error | null): string {
  const raw = error?.message || 'Unknown error';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* not JSON */
  }
  return raw;
}

const area = () => (typeof location === 'undefined' ? '' : location.pathname.split('/')[1] || 'home').slice(0, 32);

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    const kind = errorKind(error);
    // A stale chunk that slipped past the lazy loader still gets its one reload.
    if (kind === 'chunk' && recoverFromStaleChunk()) return;
    logProductEvent('page_error', { kind, area: area() });
  }

  public componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => this.setState({ error: null });

  public render() {
    if (this.state.error) return <ErrorScreen error={this.state.error} onRetry={this.retry} />;
    return this.props.children;
  }
}

function reloadHere() {
  try { sessionStorage.setItem('cw-splash', '1'); } catch { /* ignore */ }
  window.location.reload();
}

/**
 * What a reader sees when a page can't draw. It says what happened in plain
 * words, never shows a stack trace up front, and offers the one action that
 * fixes it. The raw error stays one tap away for whoever is debugging.
 */
export function ErrorScreen({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  const [offline, setOffline] = useState(isOffline());
  const kind = errorKind(error, offline);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    // Back online: reload the page they were on, which is what they were waiting for.
    const goOnline = () => { setOffline(false); reloadHere(); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const message = readableMessage(error);
  const details = [
    message,
    `Page: ${typeof location === 'undefined' ? '' : location.pathname}`,
    `Build: ${BUILD_ID}`,
    `When: ${new Date().toISOString()}`,
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the text is still selectable */
    }
  };

  const copyFor: Record<ErrorKind, { eyebrow: string; title: ReactNode; lead: string }> = {
    chunk: {
      eyebrow: 'Fresh version ready',
      title: <>CalgaryWatch just <span>updated.</span></>,
      lead: 'This tab was still running the earlier version, so the page you opened couldn’t load. One refresh brings you back to the same spot.',
    },
    offline: {
      eyebrow: 'No connection',
      title: <>You’re <span>offline</span> right now.</>,
      lead: 'Nothing’s lost. This page reloads by itself the moment your connection comes back.',
    },
    crash: {
      eyebrow: 'Our mistake',
      title: <>This page tripped <span>over itself.</span></>,
      lead: 'That one’s on us, not you. Try it again, or head somewhere that works while we look into it.',
    },
  };
  const text = copyFor[kind];

  return (
    <main className={`cw-err cw-err--${kind}`} role="alert" aria-live="assertive">
      <div className="cw-err-card">
        <div className="cw-err-mark" aria-hidden="true">
          <img src="/images/brand/calgarywatch-city-spark-v2.webp" alt="" width="96" height="96" />
          <span className="cw-err-ring" />
        </div>
        <p className="cw-err-eyebrow">{text.eyebrow}</p>
        <h1 className="cw-err-title">{text.title}</h1>
        <p className="cw-err-lead">{text.lead}</p>

        {kind === 'offline' ? (
          <p className="cw-err-wait"><span className="cw-err-dot" aria-hidden="true" />Waiting for a connection…</p>
        ) : null}

        <div className="cw-err-actions">
          {kind === 'crash' && onRetry ? (
            <button type="button" className="cw-err-btn cw-err-btn--primary" onClick={onRetry}>
              <RefreshCw size={18} aria-hidden="true" /> Try again
            </button>
          ) : (
            <button type="button" className="cw-err-btn cw-err-btn--primary" onClick={reloadHere}>
              <RefreshCw size={18} aria-hidden="true" /> {kind === 'chunk' ? 'Refresh to the new version' : 'Try again'}
            </button>
          )}
          <a className="cw-err-btn cw-err-btn--ghost" href="/">
            Go to the homepage <ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>

        {kind === 'crash' ? (
          <nav className="cw-err-links" aria-label="Popular pages">
            <a href="/events">Events</a>
            <a href="/markets">Markets</a>
            <a href="/map">Live map</a>
            <a href="/local">Local</a>
          </nav>
        ) : null}

        <details className="cw-err-details">
          <summary>Technical details</summary>
          <pre>{details}</pre>
          <button type="button" className="cw-err-copy" onClick={copy}>{copied ? 'Copied' : 'Copy details'}</button>
        </details>
      </div>
    </main>
  );
}
