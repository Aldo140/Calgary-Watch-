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
 * Whether a pending pointer move has travelled far enough past `DRAG_SLOP` to
 * become a drag rather than a tap or a scroll.
 *
 * `bidirectional` is true for the masthead, which drags both ways — the rail
 * pulls up, the raised sheet pushes down. The list only ever arms downward;
 * upward movement on the list is indistinguishable from an ordinary scroll,
 * so its caller checks sign itself and only consults this for magnitude.
 *
 * Kept pure and separate from the hook for the same reason as `resolveDragEnd`
 * — this repo has no component harness, so anything worth asserting has to be
 * reachable from plain Node.
 */
export function exceedsDragSlop(deltaY: number, bidirectional: boolean): boolean {
  return bidirectional ? Math.abs(deltaY) > DRAG_SLOP : deltaY > DRAG_SLOP;
}

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

/**
 * Clamps a raw drag offset to the valid range for a given starting state.
 *
 * When dragging from raised, the sheet can move down to travel distance,
 * but never upward past its current position. From rail, it can move up to
 * travel distance, but never downward. This prevents visual overshoot.
 */
export function clampOffset(raw: number, startState: SheetState, travel: number): number {
  if (startState === 'raised') {
    return Math.max(0, Math.min(raw, travel));
  } else {
    return Math.min(0, Math.max(raw, -travel));
  }
}

interface ActiveDrag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastT: number;
  velocity: number;
  startState: SheetState;
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
 *  - `headerHandlers` arms in either direction once movement passes
 *    `DRAG_SLOP`, and not before — see the comment on its `onPointerDown` for
 *    why `begin()`/`setPointerCapture` can't fire on `pointerdown` itself.
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

  const begin = useCallback((pointerId: number, clientY: number, el: HTMLElement, startState: SheetState) => {
    active.current = { pointerId, startY: clientY, lastY: clientY, lastT: performance.now(), velocity: 0, startState };
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
      const clamped = clampOffset(raw, drag.startState, travel);
      setOffsetY(clamped);
    },
    [travel],
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
      state: drag.startState,
    });
    if (next !== drag.startState) onStateChange(next);
  }, [onStateChange, travel]);

  const headerHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      // Only a candidate. Calling begin()/setPointerCapture here, before a
      // drag is confirmed, retargets the pointer's compatibility mouse
      // events to this div for the rest of the gesture — on a browser where
      // that includes `click`, every tap on the three buttons inside the
      // masthead (expand, report, chevron) would go inert. It also sets
      // isDragging unconditionally, killing the transform transition for a
      // tap that was never a drag. Whether this becomes a drag is decided on
      // the first move, once we know it travelled far enough to mean it.
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
      // Bidirectional: the rail drags up, the raised sheet drags down.
      if (exceedsDragSlop(delta, true)) {
        pending.current = null;
        begin(e.pointerId, candidate.startY, e.currentTarget, state);
        move(e.clientY);
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
      // Downward only — dragging the list upward is indistinguishable from a
      // normal scroll, so only a downward slop crossing arms the drag.
      if (exceedsDragSlop(delta, false) && atTop) {
        pending.current = null;
        begin(e.pointerId, candidate.startY, e.currentTarget, state);
        move(e.clientY);
      } else if (exceedsDragSlop(delta, true)) {
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
