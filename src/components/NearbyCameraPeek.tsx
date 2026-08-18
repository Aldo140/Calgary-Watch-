import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Video } from 'lucide-react';
import type { TrafficCamera } from '@/src/hooks/useTrafficCameras';
import { formatDistance } from '@/src/lib/format';
import { MAP } from '@/src/lib/tokens';

/**
 * The street, as it looks right now, a short walk from where you are standing.
 *
 * Calgary publishes 211 traffic cameras and this app already plotted every one
 * of them — but only as map pins behind a zoom threshold, each hiding its frame
 * inside a tap-to-open popup. On a phone that is the wrong shape for the
 * question people actually have. Someone who opens a safety map before leaving
 * the house is asking "what is it like out there", and a list of incident
 * titles answers that in the abstract while a photograph answers it directly.
 *
 * So the nearest camera comes to them, at the one moment they have declared
 * their location: the "you are here" step of Near Me. No zooming, no hunting
 * for a pin, no popup.
 *
 * ── On the frame ────────────────────────────────────────────────────────────
 * These are stills, not video. The city refreshes them continuously but serves
 * a cached image, so the URL carries a nonce and reloading is the only way to
 * advance the frame — hence the explicit refresh rather than a silent poll. A
 * timestamp is deliberately NOT printed over the image: the city does not
 * publish a capture time, and stamping our fetch time onto someone else's frame
 * would assert a freshness we cannot actually vouch for.
 */

export interface NearbyCameraPeekProps {
  camera: TrafficCamera;
  /** Metres from the reader to the camera. */
  distanceM: number;
  /** Fly the map to this camera. */
  onFocus: (camera: TrafficCamera) => void;
}

export default function NearbyCameraPeek({ camera, distanceM, onFocus }: NearbyCameraPeekProps) {
  // Bumping the nonce is what actually re-fetches: the URL is the cache key.
  const [nonce, setNonce] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // A different camera is a different picture — drop the previous one's loaded
  // and failed state so a working frame is never shown under a new camera's
  // label, and a past failure never suppresses a camera that works.
  useEffect(() => {
    setNonce(Date.now());
    setFailed(false);
    setLoaded(false);
  }, [camera.id]);

  const refresh = useCallback(() => {
    setNonce(Date.now());
    setFailed(false);
    setLoaded(false);
  }, []);

  return (
    <div style={{ border: `1.5px solid ${MAP.lineCool}`, background: MAP.panel }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: MAP.inkDeep }}>
        <span className="flex min-w-0 items-center gap-2">
          <Video size={12} className="shrink-0" style={{ color: MAP.ok }} aria-hidden="true" />
          <span
            className="truncate font-mono text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: '#AFC5DF' }}
          >
            Live nearby · {formatDistance(distanceM / 1000)}
          </span>
        </span>
        <button
          type="button"
          onClick={refresh}
          aria-label="Load a newer frame from this camera"
          className="flex h-7 w-7 shrink-0 items-center justify-center transition-transform active:scale-90"
          style={{ color: '#AFC5DF' }}
        >
          <RefreshCw size={12} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onFocus(camera)}
        className="block w-full text-left transition-transform active:scale-[0.99]"
      >
        <span className="relative block aspect-[3/2] w-full overflow-hidden" style={{ background: MAP.tint }}>
          {!failed && (
            <img
              key={nonce}
              src={`${camera.imageUrl}?t=${nonce}`}
              alt={`Traffic camera at ${camera.location}`}
              className="h-full w-full object-cover"
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
            />
          )}
          {/* The city's feed drops frames and individual cameras go dark for
              maintenance. Saying so is better than a broken-image glyph, and
              better than hiding the card — the camera is still there, and
              refresh may well bring it back. */}
          {failed && (
            <span
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center"
              style={{ color: MAP.muted }}
            >
              <Video size={18} aria-hidden="true" />
              <span className="text-[11px] font-bold">This camera isn’t sending a picture</span>
              <span className="font-mono text-[10px]">Tap refresh to try again</span>
            </span>
          )}
          {!failed && !loaded && (
            <span className="absolute inset-0 animate-pulse" style={{ background: MAP.tint }} aria-hidden="true" />
          )}
        </span>

        <span className="block px-3 py-2">
          <span className="block truncate text-[12.5px] font-bold leading-tight" style={{ color: MAP.inkDeep }}>
            {camera.location}
          </span>
          <span className="mt-0.5 block font-mono text-[10px]" style={{ color: MAP.muted }}>
            City of Calgary · {camera.quadrant} · tap to show on map
          </span>
        </span>
      </button>
    </div>
  );
}
