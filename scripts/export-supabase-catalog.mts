import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NormalizedCatalog } from '../types/models.js';
import type { Database, Json } from '../types/database.generated.js';

type CatalogInsert = Database['public']['Tables']['catalog_variants']['Insert'];

/** Read our generated JSON assignments without evaluating JavaScript. */
export function readBundledCatalog(source: string): NormalizedCatalog {
  const metadata = source.match(/^window\.OPENRIFT_CATALOG_META=(.*);$/m);
  const cards = source.match(/^window\.DEFAULT_RIFTBOUND_CARDS=(.*);$/m);
  if (!metadata || !cards) throw new Error('Expected the generated cards.js catalog.');
  return { metadata: JSON.parse(metadata[1]), cards: JSON.parse(cards[1]) };
}

export function catalogRows(catalog: NormalizedCatalog): CatalogInsert[] {
  const { cards, metadata } = catalog;
  if (!Array.isArray(cards) || !cards.length || metadata?.source !== 'OpenRift'
    || metadata.cardCount !== cards.length || !Number.isInteger(metadata.printingCount)
    || typeof metadata.importedAt !== 'string' || !Number.isFinite(Date.parse(metadata.importedAt))) {
    throw new Error('Empty, incomplete, or invalid catalog metadata.');
  }
  const ids = new Set<string>();
  const printingIds = new Set<string>();
  const rows = cards.map(card => {
    if (!card || typeof card.id !== 'string' || !/^openrift-[a-f0-9]{32}$/.test(card.id) || ids.has(card.id)
      || ![card.cardId, card.name, card.number, card.set].every(value => typeof value === 'string' && value.trim())
      || typeof card.specialFinish !== 'boolean' || !Array.isArray(card.finishes) || !card.finishes.length
      || card.finishes.some(finish => typeof finish !== 'string' || !finish)
      || new Set(card.finishes).size !== card.finishes.length
      || !Array.isArray(card.sourcePrintingIds) || !card.sourcePrintingIds.length
      || !Array.isArray(card.printings) || card.printings.length !== card.sourcePrintingIds.length) {
      throw new Error(`Invalid or duplicate variant: ${card?.id}`);
    }
    ids.add(card.id);
    for (const id of card.sourcePrintingIds) {
      if (typeof id !== 'string' || !id || printingIds.has(id)) throw new Error(`Invalid or duplicate printing: ${id}`);
      printingIds.add(id);
    }
    const localPrintings = new Set(card.printings.map(printing => printing.id));
    const printingFinishes = new Set(card.printings.map(printing => printing.finish));
    if (localPrintings.size !== card.sourcePrintingIds.length
      || card.sourcePrintingIds.some(id => !localPrintings.has(id))
      || printingFinishes.size !== card.finishes.length || card.finishes.some(finish => !printingFinishes.has(finish))
      || card.specialFinish !== card.finishes.every(finish => !['normal', 'foil'].includes(finish))
      || card.printings.some(printing => printing.cardId !== card.cardId || printing.language !== 'EN'
        || typeof printing.size !== 'string' || !printing.size)) {
      throw new Error(`Printing details do not match: ${card.id}`);
    }
    const { id, cardId, name, number, set, finishes, specialFinish, normal: _normal, foil: _foil, printings, ...details } = card;
    return {
      id, card_id: cardId, name, number, set_code: set, finishes, special_finish: specialFinish,
      // Keep application fields and provider IDs, without duplicating full raw printings.
      details: JSON.parse(JSON.stringify({ ...details,
        printingSizes: [...new Set(printings.map(printing => printing.size))],
        catalogImportedAt: metadata.importedAt
      })) as Json
    };
  });
  if (printingIds.size !== metadata.printingCount) throw new Error('Printing count does not match catalog metadata.');
  return rows;
}

/** Choose dollar-quote tags that cannot terminate on upstream text. */
function dollarQuote(value: string, prefix: string): string {
  let tag = `$${prefix}$`;
  while (value.includes(tag)) tag = `$${prefix += '_'}$`;
  return `${tag}${value}${tag}`;
}

export function buildCatalogImport(catalog: NormalizedCatalog): { sql: string; summary: object } {
  const rows = catalogRows(catalog);
  const payload = JSON.stringify(rows);
  const body = `declare
  incoming jsonb := ${dollarQuote(payload, 'catalog_data')};
begin
  -- Serialize catalog refreshes. This DO statement is a single atomic transaction.
  perform pg_advisory_xact_lock(736482, 1);
  -- Briefly block collection writes while checking finish changes and refreshing the catalog.
  lock table public.collection_items in share mode;
  if exists (
    select 1 from public.collection_items owned
    join public.catalog_variants previous on previous.id = owned.variant_id
    join jsonb_to_recordset(incoming) as next(id text, card_id text, finishes text[], special_finish boolean)
      on next.id = owned.variant_id
    where previous.card_id is distinct from next.card_id
      or (owned.normal > 0 and not next.special_finish and not ('normal' = any(next.finishes)))
      or (owned.foil > 0 and not ('foil' = any(next.finishes)))
  ) then
    raise exception 'Catalog changes conflict with owned variants or finishes; review before importing.'
      using errcode = '23514';
  end if;

  insert into public.catalog_variants(id,card_id,name,number,set_code,finishes,special_finish,details,active,imported_at)
    select id,card_id,name,number,set_code,finishes,special_finish,details,true,now()
    from jsonb_to_recordset(incoming) as entry(
      id text,card_id text,name text,number text,set_code text,finishes text[],special_finish boolean,details jsonb)
    on conflict(id) do update set
      card_id=excluded.card_id,name=excluded.name,number=excluded.number,set_code=excluded.set_code,
      finishes=excluded.finishes,special_finish=excluded.special_finish,details=excluded.details,
      active=true,imported_at=excluded.imported_at;

  update public.catalog_variants set active=false
    where id like 'openrift-%' and active
      and not exists (select 1 from jsonb_array_elements(incoming) entry where entry->>'id'=catalog_variants.id);
end;`;
  return {
    sql: `-- Generated from cards.js. Apply with a trusted database connection.\ndo ${dollarQuote(body, 'catalog_import')};\n`,
    summary: {
      source: 'OpenRift', sourceImportedAt: catalog.metadata.importedAt,
      variants: rows.length, gameCards: new Set(catalog.cards.map(card => card.cardId)).size,
      printings: catalog.metadata.printingCount, sha256: createHash('sha256').update(payload).digest('hex')
    }
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let input = 'cards.js';
  let output = '.cache/catalog-import.sql';
  for (let index = 0; index < args.length; index += 2) {
    const value = args[index + 1];
    if (!value || !['--input', '--output'].includes(args[index])) throw new Error('Usage: npm run catalog:sql -- [--input cards.js] [--output path.sql]');
    if (args[index] === '--input') input = value;
    else output = value;
  }
  if (resolve(input) === resolve(output)) throw new Error('Input and output paths must differ.');
  const result = buildCatalogImport(readBundledCatalog(await readFile(resolve(input), 'utf8')));
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), result.sql);
  console.log(JSON.stringify({ output, ...result.summary }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
