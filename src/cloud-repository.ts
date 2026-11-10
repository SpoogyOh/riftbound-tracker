import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/database.generated.js';
import type { CatalogEntry } from '../types/models.js';

type CatalogRow = Database['public']['Tables']['catalog_variants']['Row'];
export type CollectionRow = Database['public']['Tables']['collection_items']['Row'];
export type Edit = Pick<CollectionRow, 'normal' | 'foil' | 'image_override'>;
/** Copies of one variant in one language. */
export interface Copies { normal: number; foil: number; imageOverride: string | null }
/** `normal` and `foil` are totals across languages; `copies` holds the counts per language. */
export type CloudCard = CatalogEntry & { active: boolean; printingSizes: string[]; languages: string[];
  localized: Record<string, { name: string; imageUrl: string }>; copies: Record<string, Copies> };

function object(value: Json): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog details.');
  return value;
}

/** The SQL importer validates the full catalog; check the fields used by the UI here too. */
export function toCard(row: CatalogRow): CloudCard {
  const details = object(row.details);
  if (!/^openrift-[a-f0-9]{32}$/.test(row.id)) throw new Error('Invalid catalog ID.');
  const text = (key: string): string => {
    const value = details[key];
    if (typeof value !== 'string') throw new Error(`Invalid catalog field: ${key}`);
    return value;
  };
  const strings = (key: string): string[] => {
    const value = details[key];
    if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new Error(`Invalid catalog field: ${key}`);
    return value;
  };
  return { ...details, id: row.id, cardId: row.card_id, name: row.name, number: row.number,
    set: row.set_code, finishes: row.finishes, specialFinish: row.special_finish,
    source: 'OpenRift', sourceUrl: text('sourceUrl'), publicCode: text('publicCode'),
    variant: text('variant'), setName: text('setName'), domains: strings('domains'),
    domain: text('domain'), type: text('type'), rarity: text('rarity'), imageUrl: text('imageUrl'),
    preview: details.preview === true, rulesText: text('rulesText'), effectText: text('effectText'),
    flavorText: text('flavorText'), artist: text('artist'), keywords: strings('keywords'), tags: strings('tags'),
    sourcePrintingIds: strings('sourcePrintingIds'), printingSizes: strings('printingSizes'),
    // Catalog rows imported before languages were tracked are English only.
    languages: details.languages === undefined ? ['EN'] : strings('languages'), localized: localized(details.localized),
    active: row.active, printings: [], normal: 0, foil: 0, copies: {} };
}

function localized(value: Json | undefined): CloudCard['localized'] {
  const result: CloudCard['localized'] = {};
  if (value === undefined) return result;
  for (const [language, entry] of Object.entries(object(value))) {
    const { name, imageUrl } = object(entry ?? null);
    if (typeof name !== 'string' || typeof imageUrl !== 'string') throw new Error('Invalid catalog field: localized');
    result[language] = { name, imageUrl };
  }
  return result;
}

/** Continue until an empty page: this also works with a server page cap below 1,000. */
async function pages<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const result = await read(rows.length, rows.length + 999);
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Missing API response.');
    if (!result.data.length) return rows;
    rows.push(...result.data);
  }
}

export class CloudRepository {
  catalog: CloudCard[] = [];
  private catalogRows: Map<string, CatalogRow> | null = null;
  private byId = new Map<string, CloudCard>();
  /** Keyed by variant and language. */
  private rows = new Map<string, CollectionRow>();
  constructor(private client: SupabaseClient<Database>, readonly userId: string) {}

  /** The catalog only changes with an import, so it is read once and again only on request or when a row needs it. */
  async load(reloadCatalog = false): Promise<CloudCard[]> {
    const readCatalog = async () => new Map((await pages<CatalogRow>((from, to) =>
      this.client.from('catalog_variants').select('*').order('id').range(from, to))).map(row => [row.id, row]));
    let [items, catalog] = await Promise.all([
      pages<CollectionRow>((from, to) => this.client.from('collection_items').select('*')
        .eq('user_id', this.userId).order('variant_id').order('language').range(from, to)),
      reloadCatalog || !this.catalogRows ? readCatalog() : this.catalogRows,
    ]);
    if (catalog === this.catalogRows && items.some(row => !catalog.has(row.variant_id))) catalog = await readCatalog();
    if (items.some(row => row.user_id !== this.userId || !catalog.has(row.variant_id))) {
      throw new Error('Collection ownership or catalog mismatch.');
    }
    const owned = new Set(items.map(row => row.variant_id));
    // Keep archived variants visible when a collection row still refers to them.
    const cards = [...catalog.values()].filter(row => row.active || owned.has(row.id)).map(toCard);
    if (!cards.length) throw new Error('The online catalog is empty.');
    this.catalogRows = catalog;
    this.catalog = cards;
    this.byId = new Map(cards.map(card => [card.id, card]));
    this.rows = new Map(items.map(row => [key(row.variant_id, row.language), row]));
    return this.cards();
  }

  cards(): CloudCard[] {
    const copies = new Map<string, Record<string, Copies>>();
    for (const row of this.rows.values()) {
      const own = copies.get(row.variant_id) ?? {};
      own[row.language] = { normal: row.normal, foil: row.foil, imageOverride: row.image_override };
      copies.set(row.variant_id, own);
    }
    return this.catalog.map(card => {
      const own = Object.values(copies.get(card.id) ?? {});
      return { ...card, copies: copies.get(card.id) ?? {},
        normal: own.reduce((sum, c) => sum + c.normal, 0), foil: own.reduce((sum, c) => sum + c.foil, 0) };
    });
  }

  revision(id: string, language: string): number | null { return this.rows.get(key(id, language))?.revision ?? null; }

  async adjust(id: string, language: string, finish: 'normal' | 'foil', delta: number): Promise<void> {
    this.requireCard(id, language);
    if (!Number.isInteger(delta) || !delta || Math.abs(delta) > 999) throw new Error('Invalid adjustment.');
    // Never retry a delta automatically: a lost response can still mean a committed write.
    const { data, error } = await this.client.rpc('adjust_collection_quantity', {
      p_variant_id: id, p_finish: finish, p_delta: delta, p_language: language,
    }).retry(false);
    if (error) throw error;
    this.accept(data, id, language);
  }

  async edit(id: string, language: string, patch: Partial<Edit>): Promise<void> {
    this.requireCard(id, language);
    for (const field of ['normal', 'foil'] as const) {
      const value = patch[field];
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 999)) throw new Error('Invalid quantity.');
    }
    const previous = this.rows.get(key(id, language));
    // A unique-key collision on the first insert is a conflict, never an upsert that overwrites another device.
    const result = previous
      ? await this.client.from('collection_items').update(patch).eq('user_id', this.userId)
        .eq('variant_id', id).eq('language', language).eq('revision', previous.revision).select('*').maybeSingle().retry(false)
      : await this.client.from('collection_items').insert({ ...patch, user_id: this.userId, variant_id: id, language }).select('*').single().retry(false);
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Another device changed this card. Reload before editing again.');
    this.accept(result.data, id, language);
  }

  private requireCard(id: string, language: string): void {
    if (!this.byId.get(id)?.languages.includes(language)) throw new Error('Unknown catalog variant or language.');
  }
  private accept(row: CollectionRow | null, id: string, language: string): void {
    if (!row || row.user_id !== this.userId || row.variant_id !== id || row.language !== language) throw new Error('Unexpected collection response.');
    this.rows.set(key(id, language), row);
  }
}

const key = (id: string, language: string): string => `${id} ${language}`;
