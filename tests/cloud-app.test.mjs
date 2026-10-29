import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { apiFixture, sample, alice, bob, collectionRow } from './cloud-fixture.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sources=await Promise.all(['cards.js','collection.js','storage.js','cloud.js','app.js'].map(file=>readFile(new URL(`../${file}`,import.meta.url),'utf8')));
async function waitFor(predicate) {
  for(let i=0;i<300;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,10)); }
  throw new Error('Cloud UI did not settle');
}
async function app(t,state) {
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  await new Promise(resolve=>d.addEventListener('DOMContentLoaded',resolve,{once:true}));
  Object.assign(w,{fetch:state.fetch,Headers,Request,Response,TextEncoder,TextDecoder,structuredClone});
  Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});
  w.localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify([{id:sample.id,source:'OpenRift',normal:5,foil:0}]));
  for(const source of sources) w.eval(source);
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(()=>d.getElementById('authStatus').textContent.startsWith('Lokale Sammlung'));
  const text=id=>d.getElementById(id).textContent;
  async function signIn(email='alice@example.test') {
    d.getElementById('authEmail').value=email;
    d.getElementById('authPassword').value='example-password';
    d.getElementById('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
    await waitFor(()=>d.getElementById('authForm').hidden);
  }
  return {w,d,text,signIn};
}

test('real SDK login, online increment, lost response recovery and logout preserve the separate local collection', async t=>{
  const state=apiFixture(), {w,d,text,signIn}=await app(t,state);
  assert.equal(text('statTotalCopies'),'5');
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Online-Sammlung geladen'));
  assert.equal(d.querySelectorAll('#cardTableBody tr').length,1);
  assert.equal(text('statTotalCopies'),'0');
  assert.equal(d.getElementById('inputImportJSON').disabled,true);
  await w.adjustCardCount(sample.id,'normal',1);
  assert.equal(text('statTotalCopies'),'1');
  assert.equal((await w.CollectionStorage.load())[0].normal,5);
  state.loseWrite=true;
  await w.adjustCardCount(sample.id,'normal',1);
  assert.equal(text('statTotalCopies'),'2');
  assert.match(text('storageStatus'),/Aktueller Serverstand geladen/);
  assert.equal(state.calls.filter(c=>c.path.includes('/rpc/')).length,2);
  d.getElementById('btnSignOut').click();
  await waitFor(()=>text('authStatus').startsWith('Lokale Sammlung'));
  assert.equal(text('statTotalCopies'),'5');
  assert.equal(d.getElementById('btnOpenAddModal').disabled,false);
});

test('a loading failure locks cloud editing; switching accounts clears the previous quantities before new data arrives', async t=>{
  const state=apiFixture(undefined,[collectionRow(alice,sample.id,2),collectionRow(bob,sample.id,9)]);
  const {d,text,signIn}=await app(t,state);
  state.failRead=true;
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Bearbeiten ist gesperrt'));
  assert.equal(text('statTotalCopies'),'0');
  assert.equal(d.getElementById('btnOpenAddModal').disabled,true);
  state.failRead=false;
  d.getElementById('btnCloudRefresh').click();
  await waitFor(()=>text('statTotalCopies')==='2');
  d.getElementById('btnSignOut').click();
  await waitFor(()=>text('authStatus').startsWith('Lokale Sammlung'));
  let release;
  state.pause=new Promise(resolve=>{release=resolve;});
  await signIn('bob@example.test');
  assert.equal(text('statTotalCopies'),'0');
  release(); state.pause=null;
  await waitFor(()=>text('statTotalCopies')==='9');
  assert.equal(text('authAccount'),'bob@example.test');
});

test('an edit dialog opened before a remote refresh cannot replace the newer quantities', async t=>{
  const state=apiFixture(undefined,[collectionRow(alice,sample.id,2)]);
  const {w,d,text,signIn}=await app(t,state);
  await signIn();
  await waitFor(()=>text('statTotalCopies')==='2');
  w.openEditModal(sample.id);
  const row=state.rows.get(`${alice}:${sample.id}`); row.normal=8; row.revision++;
  d.getElementById('btnCloudRefresh').click();
  await waitFor(()=>text('statTotalCopies')==='8');
  d.getElementById('modalNormal').value='3';
  d.getElementById('modalCardForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  await waitFor(()=>text('storageStatus').includes('Dialog schließen'));
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,8);
  assert.equal(state.calls.filter(c=>c.method==='PATCH').length,0);
});

test('a late write response from a signed-out account never appears in the next account', async t=>{
  const state=apiFixture(undefined,[collectionRow(bob,sample.id,9)]);
  const {w,d,text,signIn}=await app(t,state);
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Online-Sammlung geladen'));
  let release;
  state.pauseWrite=new Promise(resolve=>{release=resolve;});
  const pending=w.adjustCardCount(sample.id,'normal',1);
  await waitFor(()=>state.calls.some(c=>c.path.includes('/rpc/')));
  d.getElementById('btnSignOut').click();
  await waitFor(()=>text('authStatus').startsWith('Lokale Sammlung'));
  await signIn('bob@example.test');
  await waitFor(()=>text('statTotalCopies')==='9');
  release(); await pending;
  assert.equal(text('statTotalCopies'),'9');
  assert.equal(text('authAccount'),'bob@example.test');
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,1);
  assert.equal(state.rows.get(`${bob}:${sample.id}`).normal,9);
});

test('registration waits for email confirmation and clears the password without creating a local session', async t=>{
  const state=apiFixture(), {d,text}=await app(t,state);
  d.getElementById('authEmail').value='alice@example.test';
  d.getElementById('authPassword').value='example-password';
  d.getElementById('btnSignUp').click();
  await waitFor(()=>text('authStatus').includes('bestätige deine E-Mail-Adresse'));
  assert.equal(d.getElementById('authPassword').value,'');
  assert.equal(d.getElementById('authForm').hidden,false);
  assert.equal(text('statTotalCopies'),'5');
  assert.equal(state.calls.filter(c=>c.path.startsWith('/rest/')).length,0);
});
