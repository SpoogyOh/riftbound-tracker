import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../types/database.generated.js';
import type { CatalogEntry } from '../types/models.js';

type CatalogRow = Database['public']['Tables']['catalog_variants']['Row'];
export type CollectionRow = Database['public']['Tables']['collection_items']['Row'];
export type Edit = Pick<CollectionRow, 'normal' | 'foil' | 'image_override'>;
export type CloudCard = CatalogEntry & { active: boolean; printingSizes: string[] };

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
    active: row.active, printings: [], normal: 0, foil: 0 };
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
  private rows = new Map<string, CollectionRow>();
  constructor(private client: SupabaseClient<Database>, readonly userId: string) {}

  async load(): Promise<CloudCard[]> {
    const [catalog, items] = await Promise.all([
      pages<CatalogRow>((from, to) => this.client.from('catalog_variants').select('*').order('id').range(from, to)),
      pages<CollectionRow>((from, to) => this.client.from('collection_items').select('*')
        .eq('user_id', this.userId).order('variant_id').range(from, to)),
    ]);
    const byId = new Map(catalog.map(row => [row.id, row]));
    if (items.some(row => row.user_id !== this.userId || !byId.has(row.variant_id))) {
      throw new Error('Collection ownership or catalog mismatch.');
    }
    this.rows = new Map(items.map(row => [row.variant_id, row]));
    // Keep archived variants visible when a collection row still refers to them.
    this.catalog = catalog.filter(row => row.active || this.rows.has(row.id)).map(toCard);
    if (!this.catalog.length) throw new Error('The online catalog is empty.');
    return this.cards();
  }

  cards(): CloudCard[] {
    return this.catalog.map(card => {
      const row = this.rows.get(card.id);
      return { ...card, normal: row?.normal ?? 0, foil: row?.foil ?? 0,
        imageUrl: row?.image_override ?? card.imageUrl };
    });
  }

  revision(id: string): number | null { return this.rows.get(id)?.revision ?? null; }

  async adjust(id: string, finish: 'normal' | 'foil', delta: number): Promise<void> {
    this.requireCard(id);
    if (!Number.isInteger(delta) || !delta || Math.abs(delta) > 999) throw new Error('Invalid adjustment.');
    // Never retry a delta automatically: a lost response can still mean a committed write.
    const { data, error } = await this.client.rpc('adjust_collection_quantity', {
      p_variant_id: id, p_finish: finish, p_delta: delta,
    }).retry(false);
    if (error) throw error;
    this.accept(data, id);
  }

  async edit(id: string, patch: Partial<Edit>): Promise<void> {
    this.requireCard(id);
    for (const field of ['normal', 'foil'] as const) {
      const value = patch[field];
      if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 999)) throw new Error('Invalid quantity.');
    }
    const previous = this.rows.get(id);
    // A unique-key collision on the first insert is a conflict, never an upsert that overwrites another device.
    const result = previous
      ? await this.client.from('collection_items').update(patch).eq('user_id', this.userId)
        .eq('variant_id', id).eq('revision', previous.revision).select('*').maybeSingle().retry(false)
      : await this.client.from('collection_items').insert({ ...patch, user_id: this.userId, variant_id: id }).select('*').single().retry(false);
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Another device changed this card. Reload before editing again.');
    this.accept(result.data, id);
  }

  private requireCard(id: string): void {
    if (!this.catalog.some(card => card.id === id)) throw new Error('Unknown catalog variant.');
  }
  private accept(row: CollectionRow | null, id: string): void {
    if (!row || row.user_id !== this.userId || row.variant_id !== id) throw new Error('Unexpected collection response.');
    this.rows.set(id, row);
  }
}
