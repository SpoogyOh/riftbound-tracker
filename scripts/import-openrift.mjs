import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const endpoint = 'https://openrift.app/api/v1/catalog?langs=EN';
const title = value => String(value || '').replace(/(^|[- ])\w/g, c => c.toUpperCase());

// Finish is deliberately excluded: ordinary normal/foil twins share two counters.
// Signed, promo, art, size and special metal finishes remain distinct variants.
export function normalizeCatalog(raw, importedAt = new Date().toISOString()) {
  if (!Array.isArray(raw.sets) || !raw.cards || !raw.printings) throw new Error('Invalid OpenRift catalog');
  const sets = new Map(raw.sets.map(s => [s.id, s]));
  const buckets = new Map();
  for (const [id, p] of Object.entries(raw.printings)) {
    if (p.language !== 'EN') continue;
    if (!raw.cards[p.cardId] || !sets.has(p.setId) || !p.shortCode || !p.finish) {
      throw new Error(`Incomplete printing: ${id}`);
    }
    const key = JSON.stringify([p.cardId, p.setId, p.shortCode, p.publicCode, p.artVariant,
      p.isSigned, [...(p.markers || [])].sort(), p.size, p.language,
      ['normal', 'foil'].includes(p.finish) ? 'standard' : p.finish]);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...p, id });
  }
  const cards = [];
  for (const [key, bucket] of buckets) {
    // Ambiguous same-finish entries must never be silently merged.
    const groups = new Set(bucket.map(p => p.finish)).size === bucket.length
      ? [bucket] : bucket.map(p => [p]);
    for (const printings of groups) {
      printings.sort((a,b) => a.id.localeCompare(b.id));
      const p = printings.find(x => x.finish === 'normal') || printings[0];
      const c = raw.cards[p.cardId];
      const set = sets.get(p.setId);
      const imageId = p.images?.[0]?.imageId;
      const specialFinish = !['normal','foil'].includes(p.finish);
      const labels = [p.artVariant !== 'normal' && title(p.artVariant), p.isSigned && 'Signature',
        ...(p.markers || []).map(title), p.size !== 'standard' && title(p.size),
        specialFinish && title(p.finish), groups.length > 1 && (p.publicCode || p.id.slice(-6))].filter(Boolean);
      const domains = (c.domains || []).map(d => ['neutral','colorless'].includes(d) ? 'Neutral' : title(d));
      const releaseDate = set.releases?.EN?.releasedAt;
      cards.push({
        id: 'openrift-' + createHash('sha256').update(key + (groups.length > 1 ? p.id : '')).digest('hex').slice(0,32),
        cardId: p.cardId, sourcePrintingIds: printings.map(x => x.id), source: 'OpenRift',
        sourceUrl: `https://openrift.app/cards/${encodeURIComponent(c.slug)}`,
        number: p.shortCode, publicCode: p.publicCode || p.shortCode,
        name: p.printedName || c.name, variant: labels.join(' · '),
        set: set.slug, setName: set.name, domains: domains.length ? domains : ['Neutral'],
        domain: domains[0] || 'Neutral',
        type: c.superTypes?.includes('champion') ? 'Champion' : c.superTypes?.includes('signature') ? 'Signature Spell' : title(c.types?.[0] || 'Other'),
        types: c.types, superTypes: c.superTypes, rarity: title(p.rarity),
        imageUrl: imageId ? `https://openrift.app/media/cards/${imageId}-400w.webp` : '',
        finishes: printings.map(x => x.finish), specialFinish,
        preview: Boolean(releaseDate && releaseDate.slice(0,10) > importedAt.slice(0,10)),
        normal: 0, foil: 0,
        rulesText: p.printedRulesText || '', effectText: p.printedEffectText || '',
        flavorText: p.flavorText || '', artist: p.artist || '',
        energy: c.energy, might: c.might, power: c.power, keywords: c.keywords || [], tags: c.tags || [],
        errata: c.errata, bans: c.bans, maxCopiesOverride: c.maxCopiesOverride,
        // Preserve provider details so later features do not require another migration.
        printings
      });
    }
  }
  if (!cards.length || new Set(cards.map(c=>c.id)).size !== cards.length) throw new Error('Empty or duplicate catalog');
  cards.sort((a,b) => a.number.localeCompare(b.number, 'en', {numeric:true}) || a.id.localeCompare(b.id));
  return { cards, metadata: { source: 'OpenRift', sourceUrl: 'https://openrift.app', endpoint, importedAt,
    cardCount: cards.length, printingCount: Object.values(raw.printings).filter(p=>p.language==='EN').length,
    sets: raw.sets.map(s=>({code:s.slug,name:s.name,releases:s.releases})) } };
}

async function atomicWrite(path, content) {
  await writeFile(path + '.tmp', content);
  await rename(path + '.tmp', path);
}

export async function updateCatalog() {
  const cacheDir = resolve(root, '.cache');
  await mkdir(cacheDir, { recursive: true });
  const cachePath = resolve(cacheDir, 'openrift.json');
  const metadataPath = resolve(cacheDir, 'openrift-http.json');
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateCatalog().catch(error => { console.error(error.message); process.exitCode = 1; });
}
