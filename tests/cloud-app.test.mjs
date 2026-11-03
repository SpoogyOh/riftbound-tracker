import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { apiFixture, sample, alice, bob, collectionRow, session } from './cloud-fixture.mjs';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sources=await Promise.all(['cards.js','collection.js','storage.js','cloud.js','app.js'].map(file=>readFile(new URL(`../${file}`,import.meta.url),'utf8')));
async function waitFor(predicate) {
  for(let i=0;i<300;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,10)); }
  throw new Error('Cloud UI did not settle');
}
async function app(t,state,url='http://localhost/') {
  const dom=new JSDOM(html,{url,runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  await new Promise(resolve=>d.addEventListener('DOMContentLoaded',resolve,{once:true}));
  Object.assign(w,{fetch:state.fetch,Headers,Request,Response,TextEncoder,TextDecoder,structuredClone});
  Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});
  w.localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify([{id:sample.id,source:'OpenRift',normal:5,foil:0}]));
  for(const source of sources) w.eval(source);
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(()=>d.getElementById('authStatus').textContent.startsWith('Lokale Sammlung') || d.getElementById('authForm').hidden);
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

for (const failRecovery of [false, true]) {
  test(`a late ${failRecovery ? 'failed' : 'successful'} recovery read never changes the next account's view`, async t=>{
    const state=apiFixture(undefined,[collectionRow(bob,sample.id,9)]);
    const fetch=state.fetch;
    let release, held=false, recovering=false;
    const pause=new Promise(resolve=>{release=resolve;});
    t.after(()=>release());
    state.fetch=async (input,init)=>{
      const response=await fetch(input,init);
      const url=new URL(String(input));
      // Hold the last page, after the account token has been checked and all data read.
      if (recovering && !held && url.pathname.endsWith('/collection_items')
        && url.searchParams.get('user_id')===`eq.${alice}` && url.searchParams.get('offset')==='1') {
        held=true;
        await pause;
        if (failRecovery) return new Response(JSON.stringify({code:'42501',message:'Read denied'}),
          {status:403,headers:{'Content-Type':'application/json'}});
      }
      return response;
    };
    const {w,d,text,signIn}=await app(t,state);
    await signIn();
    await waitFor(()=>text('storageStatus').includes('Online-Sammlung geladen'));
    recovering=true; state.loseWrite=true;
    const pending=w.adjustCardCount(sample.id,'normal',1);
    await waitFor(()=>held);
    d.getElementById('btnSignOut').click();
    await waitFor(()=>text('authStatus').startsWith('Lokale Sammlung'));
    await signIn('bob@example.test');
    await waitFor(()=>text('statTotalCopies')==='9');
    const status=text('storageStatus');
    release(); await pending;
    w.openEditModal(sample.id);
    assert.equal(d.getElementById('modalNormal').value,'9');
    assert.equal(text('statTotalCopies'),'9');
    assert.equal(text('authAccount'),'bob@example.test');
    assert.equal(text('storageStatus'),status);
    assert.equal(d.querySelector('#quickAddForm button[type="submit"]').disabled,false);
    assert.equal((await w.CollectionStorage.load())[0].normal,5);
    assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,1);
    assert.equal(state.rows.get(`${bob}:${sample.id}`).normal,9);
  });
}

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

test('password reset requests a neutral recovery email without signing in or reading collections', async t=>{
  const state=apiFixture(), {d,text}=await app(t,state);
  d.getElementById('authEmail').value='alice@example.test';
  d.getElementById('btnResetPassword').click();
  await waitFor(()=>text('authStatus').includes('Falls ein Konto existiert'));
  const recover=state.calls.filter(c=>c.path==='/auth/v1/recover');
  assert.equal(recover.length,1);
  assert.equal(recover[0].body.email,'alice@example.test');
  assert.equal(recover[0].query.get('redirect_to'),'http://localhost/');
  assert.equal(d.getElementById('authForm').hidden,false);
  assert.equal(text('statTotalCopies'),'5');
  assert.equal(state.calls.filter(c=>c.path.startsWith('/rest/')).length,0);
});

test('a recovery link shows the new-password form and saves the new password', async t=>{
  const {access_token,refresh_token}=session(alice);
  const state=apiFixture();
  const {d,text}=await app(t,state,`http://localhost/#access_token=${access_token}&refresh_token=${refresh_token}&expires_in=3600&token_type=bearer&type=recovery`);
  await waitFor(()=>!d.getElementById('authRecoveryForm').hidden);
  d.getElementById('authNewPassword').value='new-example-password';
  d.getElementById('authRecoveryForm').dispatchEvent(new d.defaultView.Event('submit',{cancelable:true}));
  await waitFor(()=>text('authStatus')==='Passwort geändert.');
  const update=state.calls.filter(c=>c.path==='/auth/v1/user'&&c.method==='PUT');
  assert.equal(update.length,1);
  assert.equal(update[0].body.password,'new-example-password');
  assert.equal(d.getElementById('authNewPassword').value,'');
  assert.equal(d.getElementById('authRecoveryForm').hidden,true);
});
