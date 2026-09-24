/** Discovery documents are separate from incidents. Dates use ISO 8601 with an offset. */
export type EntityKind = 'event' | 'market' | 'business' | 'guide' | 'neighbourhood';
export interface EntitySource { name: string; url: string; retrievedAt?: string; kind: 'official' | 'editorial' | 'submission' | 'fixture' }
export interface EntityImage { src: string; alt: string; credit?: string }
export interface EntityBase {
  id: string; kind: EntityKind; slug: string; title: string; summary: string; description: string;
  categories: string[]; tags: string[]; sources: EntitySource[]; image?: EntityImage;
  status: 'pending' | 'draft' | 'published' | 'archived'; verification: 'unverified' | 'source-checked' | 'source-feed';
  verifiedAt?: string; fetchedAt?: string; sourceId?: string; sourceRecordId?: string;
  updatedAt: string; developmentOnly?: boolean; neighbourhood?: string;
  scores?: { featured?: number; editorial?: number; demand?: number; popularity?: number };
}
export interface Location { address: string; coordinates?: { lat: number; lng: number }; venue?: string }
export interface Event extends EntityBase, Location {
  kind: 'event'; start: string; end: string; timezone: 'America/Edmonton';
  endTimeEstimated?: boolean;
  pricing: 'free' | 'paid' | 'unknown'; priceRange?: [number, number]; tickets?: string;
  organizer: string; cancelled?: boolean;
}
export interface Market extends EntityBase, Location {
  kind: 'market'; amenities: string[]; parking?: string; transit?: string;
  petFriendly?: boolean; familyFriendly?: boolean; organizer: string; vendorIds: string[]; images: EntityImage[];
}
export interface MarketOccurrence { id: string; marketId: string; start: string; end: string; timezone: 'America/Edmonton'; cancelled: boolean; source: EntitySource }
export interface Business extends EntityBase, Location {
  kind: 'business'; name: string; phone?: string; website?: string; hours?: Record<string, string>;
  priceLevel?: 1 | 2 | 3 | 4; images: EntityImage[]; socials: Record<string, string>; services: string[];
  claimed: boolean; partner: boolean; editorialSelection: boolean; offer?: string; sponsorshipDisclosure?: string;
}
export interface GuideEntry { entityId: string; note: string; comparison?: Record<string, string> }
export interface Guide extends EntityBase { kind: 'guide'; introduction: string; methodology: string; entries: GuideEntry[]; relatedGuideIds: string[]; sponsorshipDisclosure?: string }
export interface Neighbourhood extends EntityBase { kind: 'neighbourhood'; quadrant: string; entityIds: string[] }
export interface VendorAppearance { vendorId: string; marketOccurrenceId: string; source: EntitySource }
export interface ClaimRequest { id: string; entityId: string; requesterUid: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string }
export interface SubmissionBase { title: string; summary: string; description: string; address: string; venue?: string; organizer: string; sourceUrl: string; categories: string[]; tags: string[]; neighbourhood?: string; image?: EntityImage; coordinates?: { lat: number; lng: number } }
export interface EventSubmissionInput extends SubmissionBase { kind: 'event'; start: string; end: string; endTimeEstimated?: boolean; pricing: 'free' | 'paid' | 'unknown'; priceRange?: [number, number]; tickets?: string }
export interface MarketSubmissionInput extends SubmissionBase { kind: 'market'; occurrences: { sourceRecordId: string; start: string; end: string; cancelled: boolean }[]; amenities: string[]; parking?: string; transit?: string; petFriendly?: boolean; familyFriendly?: boolean }
export interface BusinessSubmissionInput extends SubmissionBase { kind: 'business'; website?: string }
export type InventorySubmissionInput = EventSubmissionInput | MarketSubmissionInput;
export interface EntitySubmission { id: string; submittedBy: string; input: InventorySubmissionInput; status: 'pending' | 'approved' | 'rejected'; createdAt: string }
export interface DemandTopic { id: string; normalizedQuery: string; resultsCount: number; timestamp: number }
export interface PartnerLead { id: string; entityId: string; status: 'new' | 'contacted' | 'interested' | 'partner' | 'closed'; notes?: string }
export type DiscoveryEntity = Event | Market | Business | Guide | Neighbourhood;
