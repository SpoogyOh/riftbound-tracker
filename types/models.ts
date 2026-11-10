/** Quantities belong to a personal collection, not to the upstream catalog. */
export interface CollectionQuantities {
  normal: number;
  foil: number;
}

export interface CardErrata {
  correctedRulesText: string | null;
  correctedEffectText: string | null;
  source: string;
  sourceUrl: string;
  effectiveDate: string;
}

export interface CardBan {
  formatId: string;
  formatName: string;
  bannedAt: string;
  reason: string | null;
}

export interface SetRelease {
  releasedAt: string | null;
  precision: string | null;
}

/** One physical printing; provider extensions are retained without using any. */
export interface PrintingDetails {
  cardId: string;
  setId: string;
  language: string;
  shortCode: string;
  finish: string;
  rarity: string;
  artVariant: string;
  size: string;
  publicCode?: string | null;
  isSigned?: boolean;
  markers?: string[];
  images?: { imageId: string }[];
  printedName?: string | null;
  printedRulesText?: string | null;
  printedEffectText?: string | null;
  flavorText?: string | null;
  artist?: string | null;
  [providerField: string]: unknown;
}

export interface Printing extends PrintingDetails {
  id: string;
}

/** One tracker row: ordinary normal/foil twins can share a row. */
export interface CatalogEntry extends CollectionQuantities {
  id: string;
  cardId: string;
  sourcePrintingIds: string[];
  source: 'OpenRift';
  sourceUrl: string;
  number: string;
  publicCode: string;
  name: string;
  variant: string;
  set: string;
  setName: string;
  domains: string[];
  domain: string;
  type: string;
  types?: string[];
  superTypes?: string[];
  rarity: string;
  imageUrl: string;
  finishes: string[];
  specialFinish: boolean;
  /** Language codes this variant was printed in, primary first. Absent in catalogs imported before languages: English. */
  languages?: string[];
  /** Printed name and image of the non-primary languages. */
  localized?: Record<string, { name: string; imageUrl: string }>;
  preview: boolean;
  rulesText: string;
  effectText: string;
  flavorText: string;
  artist: string;
  energy?: number | null;
  might?: number | null;
  power?: number | null;
  keywords: string[];
  tags: string[];
  errata?: CardErrata | null;
  bans?: CardBan[];
  maxCopiesOverride?: number | null;
  printings: Printing[];
}

export interface CatalogMetadata {
  source: 'OpenRift';
  sourceUrl: string;
  endpoint: string;
  importedAt: string;
  /** Tracker variants, rather than distinct game cards. */
  cardCount: number;
  printingCount: number;
  sets: { code: string; name: string; releases?: Record<string, SetRelease> }[];
}

export interface NormalizedCatalog {
  cards: CatalogEntry[];
  metadata: CatalogMetadata;
}

/** Compact catalog-backed entry in a JSON backup written by app.js: one per variant and language. */
export interface SavedCatalogEntry extends CollectionQuantities {
  id: string;
  language: string;
  source: 'OpenRift';
  sourcePrintingIds?: string[];
  name: string;
  number: string;
  imageOverride?: string;
}

/** Custom cards and unresolved historical entries preserve their extra fields. */
export interface SavedCustomEntry extends CollectionQuantities {
  id: string;
  name: string;
  number: string;
  source?: undefined;
  migrationReview?: boolean;
  [field: string]: unknown;
}

export interface CollectionBackup {
  schemaVersion: 4;
  savedAt: string;
  items: (SavedCatalogEntry | SavedCustomEntry)[];
}
