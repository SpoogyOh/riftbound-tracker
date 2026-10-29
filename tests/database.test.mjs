import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const migration = await readFile(new URL('../supabase/migrations/20261029164445_initial_catalog_and_collection.sql', import.meta.url), 'utf8');

// These fixtures replace Supabase Auth only. All application SQL, grants, RLS,
// functions and constraints execute in a real PostgreSQL engine via PGlite.
async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    insert into auth.users(id) values ('${alice}'), ('${bob}');
  `);
  await db.exec(migration);
  await db.exec(`
    set role service_role;
    insert into public.catalog_variants(id,card_id,name,number,set_code,finishes,special_finish) values
      ('openrift-standard','card-a','Standard','OGN-001','OGN',array['normal','foil'],false),
      ('openrift-foil','card-b','Foil only','OGN-002','OGN',array['foil'],false),
      ('openrift-metal','card-c','Metal','OGN-003','OGN',array['metal'],true);
    reset role;
  `);
  return db;
}

async function asUser(db, id = alice) {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated;');
}

const denied = { code: '42501' };

test('anonymous access and catalog writes are denied; signed-in catalog reads work', async t => {
  const db = await database(t);
  await db.exec('set role anon;');
  for (const table of ['catalog_variants', 'collection_items']) {
    await assert.rejects(db.query(`select * from public.${table}`), denied);
    await assert.rejects(db.query(`delete from public.${table}`), denied);
  }
  await assert.rejects(db.query("insert into public.catalog_variants select * from public.catalog_variants"), denied);
  await assert.rejects(db.query("update public.catalog_variants set name='Changed'"), denied);
  await assert.rejects(db.query("insert into public.collection_items(user_id,variant_id) values ($1,'openrift-standard')", [alice]), denied);
  await assert.rejects(db.query('update public.collection_items set normal=1'), denied);
  await assert.rejects(db.query("select public.adjust_collection_quantity('openrift-standard','normal',1)"), denied);
  await asUser(db);
  assert.equal((await db.query('select * from public.catalog_variants')).rows.length, 3);
  await assert.rejects(db.query("update public.catalog_variants set name='Changed'"), denied);
  await assert.rejects(db.query("insert into public.catalog_variants select * from public.catalog_variants"), denied);
  await assert.rejects(db.query('delete from public.catalog_variants'), denied);
  await assert.rejects(db.query('truncate public.collection_items'), denied);
});

test('users can manage their own collection but cannot read, alter or reassign another collection', async t => {
  const db = await database(t);
  await asUser(db);
  assert.equal((await db.query("insert into public.collection_items(variant_id,normal) values ('openrift-standard',2) returning normal")).rows[0].normal, 2);
  assert.equal((await db.query("update public.collection_items set foil=3 returning revision")).rows[0].revision, 1);
  await assert.rejects(db.query('update public.collection_items set user_id=$1', [bob]), denied);
  await asUser(db, bob);
  assert.equal((await db.query('select * from public.collection_items')).rows.length, 0);
  assert.equal((await db.query('update public.collection_items set normal=9 returning *')).rows.length, 0);
  assert.equal((await db.query('delete from public.collection_items returning *')).rows.length, 0);
  await assert.rejects(db.query("insert into public.collection_items(user_id,variant_id) values ($1,'openrift-standard')", [alice]), denied);
  assert.equal((await db.query("select * from public.adjust_collection_quantity('openrift-standard','normal',1)")).rows[0].user_id, bob);
  await asUser(db);
  assert.deepEqual((await db.query('select normal,foil from public.collection_items')).rows, [{normal:2,foil:3}]);
  assert.equal((await db.query('delete from public.collection_items returning *')).rows.length, 1);
});

test('quantity adjustments enforce limits and finish availability and roll back failed changes', async t => {
  const db = await database(t);
  await asUser(db);
  const adjust = (id, finish, delta) => db.query('select * from public.adjust_collection_quantity($1,$2,$3)', [id,finish,delta]);
  assert.equal((await adjust('openrift-standard','normal',2)).rows[0].normal, 2);
  assert.equal((await adjust('openrift-standard','normal',-1)).rows[0].normal, 1);
  assert.equal((await adjust('openrift-standard','foil',3)).rows[0].foil, 3);
  await assert.rejects(adjust('openrift-standard','normal',-2), {code:'23514'});
  await assert.rejects(adjust('openrift-standard','normal',999), {code:'23514'});
  await assert.rejects(adjust('openrift-foil','normal',1), {code:'23514'});
  assert.equal((await db.query("select * from public.collection_items where variant_id='openrift-foil'")).rows.length, 0);
  assert.equal((await adjust('openrift-foil','foil',1)).rows[0].foil, 1);
  assert.equal((await adjust('openrift-metal','normal',1)).rows[0].normal, 1);
  await assert.rejects(adjust('openrift-metal','foil',1), {code:'23514'});
  await assert.rejects(adjust('openrift-standard','invalid',1), {code:'22023'});
  await assert.rejects(adjust('openrift-standard','normal',null), {code:'22023'});
  assert.equal((await db.query("select normal from public.collection_items where variant_id='openrift-standard'")).rows[0].normal, 1);
  await assert.rejects(db.query("update public.collection_items set normal=-1"), {code:'23514'});
  await assert.rejects(db.query("update public.collection_items set foil=1000"), {code:'23514'});
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await assert.rejects(adjust('openrift-standard','normal',1), denied);
});

test('catalog edits preserve quantities; owned variants cannot be deleted and user deletion cascades', async t => {
  const db = await database(t);
  await asUser(db);
  await db.query("select public.adjust_collection_quantity('openrift-standard','normal',5)");
  await db.exec('reset role; set role service_role;');
  await db.query("update public.catalog_variants set name='Updated',active=false where id='openrift-standard'");
  await assert.rejects(db.query("delete from public.catalog_variants where id='openrift-standard'"),
    error => ['23001', '23503'].includes(error.code));
  await asUser(db);
  assert.equal((await db.query('select normal from public.collection_items')).rows[0].normal, 5);
  await db.exec('reset role;');
  await db.query('delete from auth.users where id=$1', [alice]);
  assert.equal((await db.query('select * from public.collection_items')).rows.length, 0);
  assert.equal((await db.query('select * from public.catalog_variants')).rows.length, 3);
});
