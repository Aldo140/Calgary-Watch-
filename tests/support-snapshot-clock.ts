import { mock } from 'node:test';

/**
 * Tests that read the committed listing snapshot (src/generated/discovery-index.json) check
 * real events. Those events end and go stale as the calendar moves on, so these tests
 * failed weeks after they were written without any code changing. Importing this first
 * pins `Date` to a moment the snapshot was current. Timers keep running for real.
 * Oct 30 is inside every pinned listing's 14-day freshness window. Move SNAPSHOT_NOW forward
 * whenever the snapshot is re-exported.
 */
export const SNAPSHOT_NOW = Date.parse('2026-10-30T18:00:00Z');
mock.timers.enable({ apis: ['Date'], now: SNAPSHOT_NOW });
