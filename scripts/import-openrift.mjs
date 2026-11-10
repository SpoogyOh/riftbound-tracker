import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
// No `langs` filter: OpenRift returns the printings of every language.
const endpoint = 'https://openrift.app/api/v1/catalog';
/** Existing variant IDs were built from English printings; English stays the primary language. */
const PRIMARY_LANGUAGE = 'EN';
/** @param {unknown} value */
const title = value => String(value || '').replace(/(^|[- ])\w/g, c => c.toUpperCase());
/** @param {import('../types/models.js').Printing} p */
const imageUrl = p => p.images?.[0]?.imageId ? `https://openrift.app/media/cards/${p.images[0].imageId}-400w.webp` : '';

// Finish is deliberately excluded: ordinary normal/foil twins share two counters.
// Signed, promo, art, size and special metal finishes remain distinct variants.
// Printings of the same variant in other languages join it; the collection counts copies per language.
/**
 * @param {import('../types/openrift.js').OpenRiftCatalog} raw
 * @param {string} [importedAt]
 * @returns {import('../types/models.js').NormalizedCatalog}
 */
export function normalizeCatalog(raw, importedAt = new Date().toISOString()) {
  if (!Array.isArray(raw.sets) || !raw.cards || !raw.printings) throw new Error('Invalid OpenRift catalog');
  const sets = new Map(raw.sets.map(s => [s.id, s]));
  const languageRank = new Map((raw.enums?.languages || []).map(l => [l.slug, l.sortOrder]));
  /** @param {string} a @param {string} b */
  const byLanguage = (a, b) => Number(b === PRIMARY_LANGUAGE) - Number(a === PRIMARY_LANGUAGE)
    || (languageRank.get(a) ?? 99) - (languageRank.get(b) ?? 99) || a.localeCompare(b);
  /** @type {Map<string, import('../types/models.js').Printing[]>} */
  const buckets = new Map();
  for (const [id, p] of Object.entries(raw.printings)) {
    if (!raw.cards[p.cardId] || !sets.has(p.setId) || !p.shortCode || !p.finish || !p.language) {
      throw new Error(`Incomplete printing: ${id}`);
    }
    const key = JSON.stringify([p.cardId, p.setId, p.shortCode, p.publicCode, p.artVariant,
      p.isSigned, [...(p.markers || [])].sort(), p.size, p.language,
      ['normal', 'foil'].includes(p.finish) ? 'standard' : p.finish]);
    const bucket = buckets.get(key) || [];
    bucket.push({ ...p, id });
    buckets.set(key, bucket);
  }
  // First group within each language, exactly as the English-only catalog did, so IDs stay stable.
  /** @typedef {{ id: string, printings: import('../types/models.js').Printing[], split: boolean }} Group */
  /** @type {Map<string, Group[]>} */
  const siblings = new Map();
  /** @type {Group[][]} */
  const variants = [];
  for (const [key, bucket] of buckets) {
    // Ambiguous same-finish entries must never be silently merged.
    const split = new Set(bucket.map(p => p.finish)).size !== bucket.length;
    for (const printings of split ? bucket.map(p => [p]) : [bucket]) {
      printings.sort((a,b) => a.id.localeCompare(b.id));
      const p = printings.find(x => x.finish === 'normal') || printings[0];
      const group = { printings, split,
        id: 'openrift-' + createHash('sha256').update(key + (split ? p.id : '')).digest('hex').slice(0,32) };
      if (split) { variants.push([group]); continue; }
      // The same variant in another language: OpenRift's printing identity without language, finish and public code.
      const variantKey = JSON.stringify([p.cardId, p.setId, p.shortCode, p.artVariant, p.isSigned,
        [...(p.markers || [])].sort(), p.size, ['normal', 'foil'].includes(p.finish) ? 'standard' : p.finish]);
      siblings.set(variantKey, [...(siblings.get(variantKey) || []), group]);
    }
  }
  for (const groups of siblings.values()) {
    groups.sort((a, b) => byLanguage(a.printings[0].language, b.printings[0].language) || a.id.localeCompare(b.id));
    const [primary, ...others] = groups;
    const finishes = new Set(primary.printings.map(p => p.finish));
    // Join only clear matches: one group per language, with no finish the primary language lacks.
    const clear = new Set(groups.map(g => g.printings[0].language)).size === groups.length;
    const joined = [primary];
    for (const group of others) {
      if (clear && group.printings.every(p => finishes.has(p.finish))) joined.push(group);
      else variants.push([group]);
    }
    variants.push(joined);
  }
  /** @type {import('../types/models.js').CatalogEntry[]} */
  const cards = [];
  for (const [{ id, printings, split }, ...others] of variants) {
    const p = printings.find(x => x.finish === 'normal') || printings[0];
    const c = raw.cards[p.cardId];
    const set = sets.get(p.setId);
    if (!set) throw new Error(`Unknown set: ${p.setId}`);
    const specialFinish = !['normal','foil'].includes(p.finish);
    const labels = [p.artVariant !== 'normal' && title(p.artVariant), p.isSigned && 'Signature',
      ...(p.markers || []).map(title), p.size !== 'standard' && title(p.size),
      specialFinish && title(p.finish), split && (p.publicCode || p.id.slice(-6)),
      p.language !== PRIMARY_LANGUAGE && p.language].filter(Boolean);
    const domains = (c.domains || []).map(d => ['neutral','colorless'].includes(d) ? 'Neutral' : title(d));
    const releaseDate = set.releases?.[p.language]?.releasedAt;
    /** @type {Record<string, { name: string, imageUrl: string }>} */
    const localized = {};
    for (const group of others) {
      const o = group.printings.find(x => x.finish === 'normal') || group.printings[0];
      localized[o.language] = { name: o.printedName || c.name, imageUrl: imageUrl(o) };
    }
    const all = [...printings, ...others.flatMap(group => group.printings)];
    cards.push({
      id, cardId: p.cardId, sourcePrintingIds: all.map(x => x.id), source: 'OpenRift',
      sourceUrl: `https://openrift.app/cards/${encodeURIComponent(c.slug)}`,
      number: p.shortCode, publicCode: p.publicCode || p.shortCode,
      name: p.printedName || c.name, variant: labels.join(' · '),
      set: set.slug, setName: set.name, domains: domains.length ? domains : ['Neutral'],
      domain: domains[0] || 'Neutral',
      type: c.superTypes?.includes('champion') ? 'Champion' : c.superTypes?.includes('signature') ? 'Signature Spell' : title(c.types?.[0] || 'Other'),
      types: c.types, superTypes: c.superTypes, rarity: title(p.rarity),
      imageUrl: imageUrl(p),
      finishes: printings.map(x => x.finish), specialFinish,
      // The primary language first; the other languages carry their own name and image.
      languages: [p.language, ...Object.keys(localized)], localized,
      preview: Boolean(releaseDate && releaseDate.slice(0,10) > importedAt.slice(0,10)),
      normal: 0, foil: 0,
      rulesText: p.printedRulesText || '', effectText: p.printedEffectText || '',
      flavorText: p.flavorText || '', artist: p.artist || '',
      energy: c.energy, might: c.might, power: c.power, keywords: c.keywords || [], tags: c.tags || [],
      errata: c.errata, bans: c.bans, maxCopiesOverride: c.maxCopiesOverride,
      // Preserve provider details so later features do not require another migration.
      printings: all
    });
  }
  if (!cards.length || new Set(cards.map(c=>c.id)).size !== cards.length) throw new Error('Empty or duplicate catalog');
  cards.sort((a,b) => a.number.localeCompare(b.number, 'en', {numeric:true}) || a.id.localeCompare(b.id));
  return { cards, metadata: { source: 'OpenRift', sourceUrl: 'https://openrift.app', endpoint, importedAt,
    cardCount: cards.length, printingCount: Object.keys(raw.printings).length,
    sets: raw.sets.map(s=>({code:s.slug,name:s.name,releases:s.releases})) } };
}

/** @param {string} path @param {string} content */
async function atomicWrite(path, content) {
  await writeFile(path + '.tmp', content);
  await rename(path + '.tmp', path);
}

export async function updateCatalog() {
  const cacheDir = resolve(root, '.cache');
  await mkdir(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, 'openrift.json');
  const metadataPath = resolve(cacheDir, 'openrift-http.json');
  /** @type {{ fetchedAt: number, etag?: string | null } | undefined} */
  let metadata;
  try { metadata = JSON.parse(await readFile(metadataPath, 'utf8')); } catch {}
  let rawText;
  const inputIndex = process.argv.indexOf('--input');
  if (inputIndex !== -1) {
    rawText = await readFile(resolve(process.argv[inputIndex + 1]), 'utf8');
  } else if (metadata && Date.now() - metadata.fetchedAt < 3600000) {
    rawText = await readFile(cachePath, 'utf8');
    console.log('Using OpenRift cache (minimum one hour).');
  } else {
    /** @type {Record<string, string>} */
    const headers = { Accept: 'application/json', 'User-Agent': 'RiftboundTracker/0.1 (+https://github.com/SpoogyOh/riftbound-tracker)' };
    if (metadata?.etag) headers['If-None-Match'] = metadata.etag;
    const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(45000) });
    if (response.status === 304) rawText = await readFile(cachePath, 'utf8');
    else {
      if (!response.ok) throw new Error(`OpenRift HTTP ${response.status}; Retry-After: ${response.headers.get('retry-after') || 'none'}`);
      rawText = await response.text();
    }
    // Validate before replacing either the cache or the generated catalog.
    normalizeCatalog(JSON.parse(rawText));
    await atomicWrite(cachePath, rawText);
    await atomicWrite(metadataPath, JSON.stringify({fetchedAt:Date.now(),etag:response.headers.get('etag') || metadata?.etag}));
  }
  const normalized = normalizeCatalog(JSON.parse(rawText));
  const javascript = '// Generated by npm run catalog:update. Source: https://openrift.app/developers\n'
    + `window.OPENRIFT_CATALOG_META=${JSON.stringify(normalized.metadata)};\n`
    + `window.DEFAULT_RIFTBOUND_CARDS=${JSON.stringify(normalized.cards)};\n`;
  await atomicWrite(resolve(root, 'cards.js'), javascript);
  console.log(`Imported ${normalized.cards.length} variants, ${normalized.metadata.printingCount} printings.`);
  // Per language: variants that offer it, and how many of those exist only in that language.
  /** @type {Record<string, { variants: number, only: number }>} */
  const languages = {};
  for (const card of normalized.cards) for (const language of card.languages || []) {
    const count = languages[language] ??= { variants: 0, only: 0 };
    count.variants++;
    if (card.languages?.length === 1) count.only++;
  }
  console.table(languages);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateCatalog().catch(error => { console.error(error.message); process.exitCode = 1; });
}
