import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { normalizeCatalog } from '../scripts/import-openrift.mjs';
import { buildCatalogImport, catalogRows, readBundledCatalog } from '../.cache/tools/scripts/export-supabase-catalog.mjs';

function fixture() {
  return normalizeCatalog({ sets: [{id:'set',slug:'OGN',name:'Origins'}],
    cards: {card:{name:'Test card',slug:'test',types:['unit']}}, printings: {
      normal:{cardId:'card',setId:'set',shortCode:'OGN-001',language:'EN',finish:'normal',rarity:'common',artVariant:'normal',size:'standard'},
      foil:{cardId:'card',setId:'set',shortCode:'OGN-001',language:'EN',finish:'foil',rarity:'common',artVariant:'normal',size:'standard'}
    } }, '2026-10-28T11:08:40.770Z');
}

async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;`);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).sort()) await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  return db;
}

test('complete bundled catalog imports with every variant and provider ID, without quantity or raw printing duplication', async t => {
  const catalog = readBundledCatalog(await readFile(new URL('../cards.js', import.meta.url), 'utf8'));
  const rows = catalogRows(catalog);
  assert.equal(rows.length, catalog.metadata.cardCount);
  assert.equal(new Set(rows.flatMap(row => row.details.sourcePrintingIds)).size, catalog.metadata.printingCount);
  assert.deepEqual(rows.map(row => row.id), catalog.cards.map(card => card.id));
  assert.ok(rows.every(row => !('normal' in row.details) && !('foil' in row.details) && !('printings' in row.details)));
  assert.deepEqual(rows[0].details.printingSizes, ['standard']);
  const db = await database(t);
  await db.exec(buildCatalogImport(catalog).sql);
  const imported = (await db.query('select id,details from public.catalog_variants order by id')).rows;
  assert.deepEqual(imported.map(row => row.id), rows.map(row => row.id).sort());
  assert.equal(imported.reduce((sum,row) => sum + row.details.sourcePrintingIds.length, 0), catalog.metadata.printingCount);
});

test('incomplete catalogs and duplicate provider IDs are rejected before any SQL is produced', () => {
  const catalog = fixture();
  assert.throws(() => buildCatalogImport({...catalog,cards:[]}), /metadata/);
  assert.throws(() => buildCatalogImport({...catalog,metadata:{...catalog.metadata,printingCount:99}}), /Printing count/);
  const duplicate = structuredClone(catalog);
  duplicate.cards.push({...duplicate.cards[0],id:'openrift-'+'f'.repeat(32)});
  duplicate.metadata.cardCount++;
  assert.throws(() => buildCatalogImport(duplicate), /duplicate printing/);
});

test('SQL upserts repeatably, quotes upstream text safely, archives missing variants and retains owned quantities', async t => {
  const db = await database(t);
  const catalog = fixture();
  catalog.cards[0].name = "O'Connor $catalog_data$ $catalog_import$ \\ ' ; drop table public.collection_items; --";
  const sql = buildCatalogImport(catalog).sql;
  await db.exec(sql);
  const id = catalog.cards[0].id;
  await db.query("insert into auth.users values ('11111111-1111-4111-8111-111111111111')");
  await db.query("insert into public.collection_items(user_id,variant_id,normal,foil) values ('11111111-1111-4111-8111-111111111111',$1,2,3)",[id]);
  await db.exec(sql);
  assert.equal((await db.query('select count(*)::int as count from public.catalog_variants')).rows[0].count, 1);
  assert.equal((await db.query('select name from public.catalog_variants')).rows[0].name, catalog.cards[0].name);
  assert.deepEqual((await db.query('select normal,foil from public.collection_items')).rows,[{normal:2,foil:3}]);
  const replacement = fixture();
  replacement.cards[0].id = 'openrift-'+'a'.repeat(32);
  await db.exec(buildCatalogImport(replacement).sql);
  assert.equal((await db.query('select active from public.catalog_variants where id=$1',[id])).rows[0].active,false);
  assert.equal((await db.query('select normal from public.collection_items')).rows[0].normal,2);
  await db.exec(sql);
  assert.equal((await db.query('select active from public.catalog_variants where id=$1',[id])).rows[0].active,true);
});

test('catalog identity and finish changes conflicting with owned cards fail atomically', async t => {
  const db = await database(t);
  const catalog = fixture();
  const original = buildCatalogImport(catalog).sql;
  await db.exec(original);
  await db.exec("insert into auth.users values ('11111111-1111-4111-8111-111111111111')");
  await db.query("insert into public.collection_items(user_id,variant_id,foil) values ('11111111-1111-4111-8111-111111111111',$1,3)",[catalog.cards[0].id]);
  const changed = structuredClone(catalog);
  changed.cards[0].finishes = ['normal'];
  changed.cards[0].sourcePrintingIds = ['normal'];
  changed.cards[0].printings = changed.cards[0].printings.filter(printing => printing.finish === 'normal');
  changed.metadata.printingCount = 1;
  changed.cards[0].name = 'Should not be written';
  await assert.rejects(db.exec(buildCatalogImport(changed).sql),{code:'23514'});
  const changedIdentity = structuredClone(catalog);
  changedIdentity.cards[0].cardId = 'different-card';
  changedIdentity.cards[0].printings.forEach(printing => { printing.cardId = 'different-card'; });
  await assert.rejects(db.exec(buildCatalogImport(changedIdentity).sql),{code:'23514'});
  assert.equal((await db.query('select name from public.catalog_variants')).rows[0].name,catalog.cards[0].name);
  assert.equal((await db.query('select foil from public.collection_items')).rows[0].foil,3);
});

test('printings in other languages join their variant; removing an owned language fails atomically', async t => {
  const db = await database(t);
  const raw = { sets: [{id:'set',slug:'OGN',name:'Origins'}], cards: {card:{name:'Test card',slug:'test',types:['unit']}}, printings: {} };
  for (const language of ['EN','FR']) for (const finish of ['normal','foil']) {
    raw.printings[`${language}-${finish}`] = {cardId:'card',setId:'set',shortCode:'OGN-001',language,finish,rarity:'common',
      artVariant:'normal',size:'standard',printedName:`Name ${language}`,images:[{imageId:`image-${language}`}]};
  }
  const catalog = normalizeCatalog(raw, '2026-10-28T11:08:40.770Z');
  const [row] = catalogRows(catalog);
  assert.deepEqual(row.details.languages, ['EN','FR']);
  assert.deepEqual(row.details.localized, {FR:{name:'Name FR',imageUrl:'https://openrift.app/media/cards/image-FR-400w.webp'}});
  assert.equal(row.details.sourcePrintingIds.length, 4);
  await db.exec(buildCatalogImport(catalog).sql);
  await db.exec("insert into auth.users values ('11111111-1111-4111-8111-111111111111')");
  await db.query("insert into public.collection_items(user_id,variant_id,language,foil) values ('11111111-1111-4111-8111-111111111111',$1,'FR',2)",[row.id]);
  delete raw.printings['FR-normal']; delete raw.printings['FR-foil'];
  const english = normalizeCatalog(raw, '2026-10-28T11:08:40.770Z');
  assert.equal(english.cards[0].id, row.id);
  await assert.rejects(db.exec(buildCatalogImport(english).sql),{code:'23514'});
  assert.deepEqual((await db.query('select details from public.catalog_variants')).rows[0].details.languages, ['EN','FR']);
  await db.query('update public.collection_items set foil=0');
  await db.exec(buildCatalogImport(english).sql);
  assert.deepEqual((await db.query('select details from public.catalog_variants')).rows[0].details.languages, ['EN']);
});
