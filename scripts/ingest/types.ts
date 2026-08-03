/**
 * Shared normalized incident type used by all ingestion sources.
 * Maps to the Firestore `incidents` collection schema.
 */

import type { IncidentCategory, DataSource, SourceType } from '../../src/types/index.js';

export interface NormalizedIncident {
  title: string;
  description: string;
  category: IncidentCategory;
  neighborhood: string;
  lat: number;
  lng: number;
  source_name: string;
  source_url: string;
  source_type: SourceType;
  data_source: DataSource;
  /** `<source_type>:<external_id>` — used for dedup in Firestore */
  dedup_key: string;
  /**
   * Unix ms when the source says this was reported.
   *
   * Optional for sources that genuinely have no report time. When absent the
   * pipeline falls back to ingest time — but every source that knows should
   * set it, otherwise the map claims week-old reports happened just now.
   */
  timestamp?: number;
  /** Unix ms timestamp when this incident should be hidden */
  expires_at: number;
  verified_status: 'community_confirmed';
  report_count: 1;
  email: string;
  name: string;
  anonymous: false;
}
