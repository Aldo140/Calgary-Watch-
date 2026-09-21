import type { InventorySubmissionInput } from '../../src/types/discovery';
export interface SourceConfig { id: string; name: string; approved: boolean; hosts: string[]; kind: 'official' | 'editorial'; feedUrl?: string }
export interface SourceRecord { id: string; input: InventorySubmissionInput; cancelled?: boolean }
export interface InventoryProvider { source: SourceConfig; fetch(): Promise<SourceRecord[]> }
/** Explicit JSON contract; adapters translate provider-specific APIs into this shape. */
export class JsonFeedProvider implements InventoryProvider {
  constructor(public source: SourceConfig) {}
  async fetch(): Promise<SourceRecord[]> {
    if (!this.source.approved || !this.source.feedUrl || !this.source.hosts.includes(new URL(this.source.feedUrl).hostname) || !this.source.feedUrl.startsWith('https://')) throw Error('Unapproved feed endpoint');
    const response = await fetch(this.source.feedUrl, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept:'application/json' } });
    if (!response.ok) throw Error(`Feed failed: ${response.status}`);
    const body = await response.text(); if (body.length > 2_000_000) throw Error('Feed exceeds limit');
    const records = JSON.parse(body); if (!Array.isArray(records) || records.length > 500) throw Error('Expected at most 500 source records');
    return records;
  }
}
export class EditorialFileProvider implements InventoryProvider {
  constructor(public source: SourceConfig, private records: SourceRecord[]) {}
  async fetch() { return this.records; }
}
