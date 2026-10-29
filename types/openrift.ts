import type { CardBan, CardErrata, PrintingDetails, SetRelease } from './models.js';

/** Expected provider fields consumed by the importer, not a runtime validator. */
export interface OpenRiftCard {
  name: string;
  slug: string;
  domains?: string[];
  types?: string[];
  superTypes?: string[];
  energy?: number | null;
  might?: number | null;
  power?: number | null;
  keywords?: string[];
  tags?: string[];
  errata?: CardErrata | null;
  bans?: CardBan[];
  maxCopiesOverride?: number | null;
  [providerField: string]: unknown;
}

export interface OpenRiftSet {
  id: string;
  slug: string;
  name: string;
  releases?: Record<string, SetRelease>;
  [providerField: string]: unknown;
}

export interface OpenRiftCatalog {
  sets: OpenRiftSet[];
  cards: Record<string, OpenRiftCard>;
  printings: Record<string, PrintingDetails>;
}
