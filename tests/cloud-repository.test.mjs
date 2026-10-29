import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import repositoryModule from '../.cache/tools/src/cloud-repository.js';
import { alice, bob, sample, session, collectionRow, apiFixture } from './cloud-fixture.mjs';
const {CloudRepository} = repositoryModule;
const repository = (state, owner = alice) => new CloudRepository(createClient('https://example.supabase.co', 'sb_publishable_test', {
  accessToken: async () => session(owner).access_token, global: { fetch: state.fetch },
}), owner);

test('catalog pagination, archived owned variants and owner-scoped reads survive a small server page cap', async () => {
  const catalog = Array.from({length:1007},(_,i)=>({...sample,id:`openrift-${i.toString(16).padStart(32,'0')}`,active:i!==1&&i!==2}));
  const state = apiFixture(catalog,[collectionRow(alice,catalog[1].id,4),collectionRow(bob,catalog[3].id,8)]);
  const repo = repository(state), cards = await repo.load();
  assert.equal(cards.length,1006);
  assert.equal(cards.find(c=>c.id===catalog[1].id).active,false);
  assert.equal(cards.find(c=>c.id===catalog[1].id).normal,4);
  assert.equal(cards.find(c=>c.id===catalog[3].id).normal,0);
  assert.deepEqual(state.calls.filter(c=>c.path.endsWith('/catalog_variants')).map(c=>c.query.get('offset')),['0','400','800','1007']);
});

test('two devices add atomically; stale absolute edits and competing first inserts never overwrite', async () => {
  const state = apiFixture(undefined,[collectionRow()]);
  const first = repository(state), second = repository(state);
  await Promise.all([first.load(),second.load()]);
  await first.adjust(sample.id,'normal',1);
  await second.adjust(sample.id,'normal',1);
  assert.equal(second.cards()[0].normal,2);
  await assert.rejects(first.edit(sample.id,{normal:7}),/Another device/);
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,2);
  await first.load();
  await first.edit(sample.id,{normal:3,foil:4,image_override:'https://example.test/card.png'});
  assert.equal(first.cards()[0].foil,4);
  const third=repository(state,bob), fourth=repository(state,bob);
  await Promise.all([third.load(),fourth.load()]);
  await third.edit(sample.id,{normal:5});
  await assert.rejects(fourth.edit(sample.id,{normal:6}),error=>error.code==='23505');
  assert.equal(state.rows.get(`${bob}:${sample.id}`).normal,5);
});

test('a committed increment with a lost response is sent once and recovered with a read', async () => {
  const state=apiFixture(), repo=repository(state);
  await repo.load(); state.loseWrite=true;
  await assert.rejects(repo.adjust(sample.id,'normal',1));
  assert.equal(state.calls.filter(c=>c.path.endsWith('/adjust_collection_quantity')).length,1);
  assert.equal((await repo.load())[0].normal,1);
  await assert.rejects(repo.edit(sample.id,{normal:1000}),/Invalid quantity/);
});
