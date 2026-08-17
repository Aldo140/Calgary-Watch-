import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** The sheet has two positions and nothing in between that persists. */
export type SheetState = 'rail' | 'raised';

export interface DragEndInput {
  /** Pixels moved since the drag began. Positive is downward. */
  deltaY: number;
  /** Pixels per millisecond at release. Positive is downward. */
  velocity: number;
  /** Pixel distance between the rail and raised positions. */
  travel: number;
  /** The state the drag began from. */
  state: SheetState;
}

/** Fraction of the travel a drag must cover to commit without a fling. */
const COMMIT_FRACTION = 0.25;
/** px/ms past which a short drag still commits. */
const FLING_VELOCITY = 0.5;
/** px of movement before a touch on the list is treated as a drag, not a tap. */
const DRAG_SLOP = 6;

/**
 * Where the sheet lands when the finger lifts.
 *
 * Kept pure and separate from the hook so the rule is testable without a DOM —
 * this repo has no component harness, so anything worth asserting has to be
 * reachable from plain Node.
 */
export function resolveDragEnd({ deltaY, velocity, travel, state }: DragEndInput): SheetState {
  if (travel <= 0) return state;
  const closing = state === 'raised';
  const target: SheetState = closing ? 'rail' : 'raised';

  // Progress toward the *other* state. Negative means the finger moved toward
  // the end the sheet already occupies, which can never commit anything.
  const progress = closing ? deltaY : -deltaY;
  const flung = closing ? velocity >= FLING_VELOCITY : velocity <= -FLING_VELOCITY;

  if (flung && progress > 0) return target;
  if (progress >= travel * COMMIT_FRACTION) return target;
  return state;
}

interface ActiveDrag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
}

/**
 * Pointer-driven drag for a two-state bottom sheet.
 *
 * Replaces vaul for this sheet. The substantive difference is that
 * `touch-action: none` is applied by the *consumer* to the drag zone alone
 * (see MobileMapSheet) and never to the document — vaul mutated global
 * touch-action during its springs, which broke Leaflet's touch tracking and
 * froze form inputs after a pin drop three separate times.
 *
 * Two handler sets, because the two zones have different rules:
 *  - `headerHandlers` always drags.
 *  - `listHandlers` drags only from `scrollTop === 0` and only downward, so
 *    mid-list scrolling is untouched.
 */
export function useSheetDrag({
  state,
  onStateChange,
  scrollRef,
  travel,
  enabled = true,
}: {
  state: SheetState;
  onStateChange: (next: SheetState) => void;
  scrollRef: RefObject<HTMLElement | null>;
  travel: number;
  enabled?: boolean;
}) {
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const active = useRef<ActiveDrag | null>(null);
  const pending = useRef<{ pointerId: number; startY: number } | null>(null);

  const begin = useCallback((pointerId: number, clientY: number, el: HTMLElement) => {
    active.current = { pointerId, startY: clientY, lastY: clientY, lastT: performance.now(), velocity: 0 };
    setIsDragging(true);
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* capture is an optimisation; the drag still works without it */
    }
  }, []);

  const move = useCallback(
    (clientY: number) => {
      const drag = active.current;
      if (!drag) return;
      const now = performance.now();
      const dt = now - drag.lastT;
      if (dt > 0) drag.velocity = (clientY - drag.lastY) / dt;
      drag.lastY = clientY;
      drag.lastT = now;

      // Clamp so the sheet cannot be pulled past either end.
      const raw = clientY - drag.startY;
      setOffsetY(state === 'raised' ? Math.max(0, raw) : Math.min(0, raw));
    },
    [state],
  );

  const finish = useCallback(() => {
    const drag = active.current;
    active.current = null;
    pending.current = null;
    setIsDragging(false);
    setOffsetY(0);
    if (!drag) return;
    const next = resolveDragEnd({
      deltaY: drag.lastY - drag.startY,
      velocity: drag.velocity,
      travel,
      state,
    });
    if (next !== state) onStateChange(next);
  }, [onStateChange, state, travel]);

  const headerHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      begin(e.pointerId, e.clientY, e.currentTarget);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => move(e.clientY),
    onPointerUp: () => finish(),
    onPointerCancel: () => finish(),
  };

  const listHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || state !== 'raised') return;
      // Only a candidate. Whether this becomes a drag or a scroll is decided on
      // the first move, once we know the direction.
      pending.current = { pointerId: e.pointerId, startY: e.clientY };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (active.current) {
        move(e.clientY);
        return;
      }
      const candidate = pending.current;
      if (!candidate || candidate.pointerId !== e.pointerId) return;
      const delta = e.clientY - candidate.startY;
      const atTop = (scrollRef.current?.scrollTop ?? 0) <= 0;
      if (delta > DRAG_SLOP && atTop) {
        pending.current = null;
        begin(e.pointerId, candidate.startY, e.currentTarget);
        move(e.clientY);
      } else if (Math.abs(delta) > DRAG_SLOP) {
        // Upward, or not at the top: this is a scroll. Stop watching.
        pending.current = null;
      }
    },
    onPointerUp: () => {
      pending.current = null;
      if (active.current) finish();
    },
    onPointerCancel: () => {
      pending.current = null;
      if (active.current) finish();
    },
  };

  return { headerHandlers, listHandlers, offsetY, isDragging };
}
