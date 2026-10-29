import type { CatalogEntry, CatalogMetadata } from './models.js';

declare global {
  interface Window {
    DEFAULT_RIFTBOUND_CARDS: CatalogEntry[];
    OPENRIFT_CATALOG_META: CatalogMetadata;
  }
}
