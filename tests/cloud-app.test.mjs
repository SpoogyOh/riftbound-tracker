import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { apiFixture, sample, fullCatalog, alice, bob, collectionRow } from './cloud-fixture.mjs';
import { build } from 'esbuild';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
// Bundle the same entry Vite builds; jsdom does not need the stylesheet.
const {outputFiles}=await build({entryPoints:[fileURLToPath(new URL('../src/main.ts',import.meta.url))],bundle:true,format:'iife',
  platform:'browser',target:'es2022',write:false,loader:{'.css':'empty','.svg':'dataurl','.png':'dataurl'}});
const sources=[outputFiles[0].text];
async function waitFor(predicate) {
  for(let i=0;i<300;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,10)); }
  throw new Error('Cloud UI did not settle');
}
// Data from the former local mode must stay untouched in the browser, even though the app no longer reads it.
const legacy=JSON.stringify([{id:sample.id,source:'OpenRift',normal:5,foil:0}]);
async function app(t,state) {
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  await new Promise(resolve=>d.addEventListener('DOMContentLoaded',resolve,{once:true}));
  Object.assign(w,{fetch:state.fetch,Headers,Request,Response,TextEncoder,TextDecoder,structuredClone});
  w.localStorage.setItem('riftbound_card_tracker_v2',legacy);
  for(const source of sources) w.eval(source);
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const signedOut=()=>d.body.dataset.session==='signed-out';
  await waitFor(signedOut);
  const text=id=>d.getElementById(id).textContent;
  async function signIn(email='alice@example.test') {
    d.getElementById('authEmail').value=email;
    d.getElementById('authPassword').value='example-password';
    d.getElementById('authForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
    await waitFor(()=>d.body.dataset.session==='signed-in');
  }
  const legacyUntouched=()=>w.localStorage.getItem('riftbound_card_tracker_v2')===legacy;
  return {w,d,text,signIn,signedOut,legacyUntouched};
}

test('OGN-027 and OGN-027a share playset progress in stats, filters, grid, table and panel', async t=>{
  const base=fullCatalog.find(c=>c.number==='OGN-027');
  const alt=fullCatalog.find(c=>c.number==='OGN-027a');
  assert.equal(base.card_id,alt.card_id);
  // An identical name or similar collector number must not merge a different game card.
  const other={...sample,card_id:'different-game-card',name:base.name,number:'OGN-027b'};
  const state=apiFixture([base,alt,other],[
    {...collectionRow(alice,base.id),foil:2},
    {...collectionRow(alice,alt.id),foil:1},
    collectionRow(alice,other.id,2)
  ]);
  const {w,d,text,signIn,signedOut}=await app(t,state);
  await signIn();
  await waitFor(()=>text('statTotalCopies')==='5');
  assert.equal(text('statPlaysets'),'1');
  assert.equal(text('statUniqueOwned'),'3');
  for (const card of [base,alt]) {
    const gridCard=d.querySelector(`#gridContainer [data-card-id="${card.id}"]`);
    assert.match(gridCard.textContent,/Playset\s+3 \/ 3/);
    assert.equal(gridCard.querySelectorAll('.bg-ink').length,3);
  }
  w.openCardPanel(alt.id);
  assert.equal(text('panelPlaysetText'),'3 / 3');
  assert.equal(text('panelFoilVal'),'1');
  assert.equal(text('panelNormalVal'),'0');

  const search=d.getElementById('searchInput');
  search.value='OGN-027a'; search.dispatchEvent(new w.Event('input'));
  d.querySelector('[data-ownership="playset"]').click();
  assert.equal(d.querySelectorAll('#gridContainer > div').length,1);
  assert.match(d.getElementById('gridContainer').textContent,/3 \/ 3/);
  d.querySelector('[data-ownership="incomplete"]').click();
  assert.equal(d.querySelectorAll('#gridContainer > div').length,0);
  d.getElementById('btnClearSearch').click();
  assert.equal(d.querySelector('#gridContainer > div').dataset.cardId,other.id);
  d.querySelector('[data-ownership="playset"]').click();
  d.getElementById('viewBtnTable').click();
  const rows=[...d.querySelectorAll('#cardTableBody tr')];
  assert.equal(rows.length,2);
  for(const row of rows) assert.equal(row.cells[5].textContent.trim().replace(/\s+/g,' '),'3 / 3');

  await w.adjustCardCount(alt.id,'foil',1);
  assert.equal(text('panelPlaysetText'),'4 / 3');
  assert.equal(text('statPlaysets'),'1');
  assert.equal(text('panelFoilVal'),'2');
  await w.adjustCardCount(base.id,'foil',-1);
  await w.adjustCardCount(base.id,'foil',-1);
  assert.equal(text('panelPlaysetText'),'2 / 3');
  assert.equal(text('statPlaysets'),'0');
  assert.equal(d.querySelectorAll('#cardTableBody tr').length,0);
  assert.equal(state.rows.get(`${alice}:${alt.id}`).foil,2);
  assert.equal(state.rows.get(`${alice}:${base.id}`).foil,0);
  d.getElementById('btnSignOut').click();
  await waitFor(signedOut);
  assert.equal(text('statPlaysets'),'0');
});

test('playsets combine normal and foil across sets and count Legends and Battlefields once', async t=>{
  const alt={...sample,id:`openrift-${'a'.repeat(32)}`,set_code:'OTHER',number:'OTHER-001'};
  const cards=[{...sample,active:true}, {...alt,active:true}];
  const owned=[collectionRow(alice,sample.id,2),{...collectionRow(alice,alt.id),foil:1}];
  for(const type of ['Legend','Battlefield']) {
    const base=fullCatalog.find(c=>c.details.type===type && fullCatalog.some(v=>v.card_id===c.card_id && v.id!==c.id));
    const variant=fullCatalog.find(c=>c.card_id===base.card_id && c.id!==base.id);
    assert.ok(variant,`Expected a real ${type} variant`);
    cards.push(base,variant);
    owned.push(collectionRow(alice,base.id,1),collectionRow(alice,variant.id,1));
  }
  const {w,d,text,signIn}=await app(t,apiFixture(cards,owned));
  await signIn();
  await waitFor(()=>text('statPlaysets')==='3');
  const select=d.getElementById('filterSet');
  select.value=sample.set_code; select.dispatchEvent(new w.Event('change'));
  d.querySelector('[data-ownership="playset"]').click();
  assert.match(d.querySelector(`#gridContainer [data-card-id="${sample.id}"]`).textContent,/3 \/ 3/);
  for(const card of cards.slice(2)) {
    w.openCardPanel(card.id);
    assert.equal(text('panelPlaysetText'),'2 / 1');
  }
});

test('Rune variants each require ten copies in stats, filters, grid, table and panel', async t=>{
  const base=fullCatalog.find(c=>c.number==='OGN-007' && c.details.type==='Rune');
  const alt=fullCatalog.find(c=>c.number==='OGN-007a' && c.details.type==='Rune');
  assert.equal(base.card_id,alt.card_id);
  const state=apiFixture([base,alt],[collectionRow(alice,base.id,4),{...collectionRow(alice,alt.id),foil:6}]);
  const {w,d,text,signIn}=await app(t,state);
  await signIn();
  await waitFor(()=>text('statTotalCopies')==='10');
  assert.equal(text('statPlaysets'),'0');
  for(const [card,total] of [[base,4],[alt,6]]) {
    const tile=d.querySelector(`#gridContainer [data-card-id="${card.id}"]`);
    assert.match(tile.textContent,new RegExp(`Playset\\s+${total} / 10`));
    assert.equal(tile.querySelectorAll('.rounded-full').length,0);
  }
  w.openCardPanel(base.id);
  assert.equal(text('panelPlaysetText'),'4 / 10');
  assert.equal(text('panelPlaysetLabel'),'Playset · this variant');
  d.querySelector('[data-ownership="playset"]').click();
  assert.equal(d.querySelectorAll('#gridContainer > div').length,0);
  await w.updateCardCount(base.id,'normal',10);
  assert.equal(text('statPlaysets'),'1');
  assert.equal(text('panelPlaysetText'),'10 / 10');
  assert.equal(d.querySelectorAll('#gridContainer > div').length,1);
  assert.equal(d.querySelector('#gridContainer > div').dataset.cardId,base.id);
  d.querySelector('[data-ownership="incomplete"]').click();
  assert.equal(d.querySelector('#gridContainer > div').dataset.cardId,alt.id);
  w.openCardPanel(alt.id);
  assert.equal(text('panelPlaysetText'),'6 / 10');
  d.getElementById('viewBtnTable').click();
  const row=d.querySelector('#cardTableBody tr');
  assert.equal(row.cells[5].textContent.trim().replace(/\s+/g,' '),'6 / 10');
  assert.equal(row.cells[5].querySelectorAll('.rounded-full').length,0);
  await w.updateCardCount(alt.id,'foil',10);
  assert.equal(text('statPlaysets'),'2');
  assert.equal(d.querySelectorAll('#cardTableBody tr').length,0);
  d.querySelector('[data-ownership="playset"]').click();
  assert.equal(d.querySelectorAll('#cardTableBody tr').length,2);
  await w.adjustCardCount(base.id,'normal',-1);
  assert.equal(text('statPlaysets'),'1');
  assert.equal(d.querySelector('#cardTableBody tr').dataset.cardId,alt.id);
  assert.equal(state.rows.get(`${alice}:${base.id}`).normal,9);
  assert.equal(state.rows.get(`${alice}:${alt.id}`).foil,10);
});

test('real SDK login, online increment, lost response recovery and logout; old local data stays untouched', async t=>{
  const state=apiFixture(), {w,d,text,signIn,signedOut,legacyUntouched}=await app(t,state);
  assert.equal(text('statTotalCopies'),'0');
  await signIn();
  assert.equal(d.body.dataset.session,'signed-in');
  await waitFor(()=>text('storageStatus').includes('Online collection loaded'));
  assert.equal(d.querySelectorAll('#gridContainer > div').length,1);
  assert.equal(text('statTotalCopies'),'0');
  await w.adjustCardCount(sample.id,'normal',1);
  assert.equal(text('statTotalCopies'),'1');
  assert.ok(legacyUntouched());
  state.loseWrite=true;
  await w.adjustCardCount(sample.id,'normal',1);
  assert.equal(text('statTotalCopies'),'2');
  assert.match(text('storageStatus'),/Loaded the current server state/);
  assert.equal(state.calls.filter(c=>c.path.includes('/rpc/')).length,2);
  d.getElementById('btnSignOut').click();
  await waitFor(signedOut);
  assert.equal(text('statTotalCopies'),'0');
  assert.equal(d.querySelectorAll('#gridContainer > div').length,0);
  assert.ok(legacyUntouched());
});

test('a loading failure locks cloud editing; switching accounts clears the previous quantities before new data arrives', async t=>{
  const state=apiFixture(undefined,[collectionRow(alice,sample.id,2),collectionRow(bob,sample.id,9)]);
  const {d,text,signIn,signedOut}=await app(t,state);
  state.failRead=true;
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Editing is locked'));
  assert.equal(text('statTotalCopies'),'0');
  assert.ok(d.getElementById('emptyState').classList.contains('hidden'));
  assert.equal(d.querySelector('#modalCardForm button[type="submit"]').disabled,true);
  state.failRead=false;
  d.getElementById('btnCloudRefresh').click();
  await waitFor(()=>text('statTotalCopies')==='2');
  d.getElementById('btnSignOut').click();
  await waitFor(signedOut);
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
  await waitFor(()=>text('storageStatus').includes('Close the dialog'));
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,8);
  assert.equal(state.calls.filter(c=>c.method==='PATCH').length,0);
});

test('a late write response from a signed-out account never appears in the next account', async t=>{
  const state=apiFixture(undefined,[collectionRow(bob,sample.id,9)]);
  const {w,d,text,signIn,signedOut}=await app(t,state);
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Online collection loaded'));
  let release;
  state.pauseWrite=new Promise(resolve=>{release=resolve;});
  const pending=w.adjustCardCount(sample.id,'normal',1);
  await waitFor(()=>state.calls.some(c=>c.path.includes('/rpc/')));
  d.getElementById('btnSignOut').click();
  await waitFor(signedOut);
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
    const {w,d,text,signIn,signedOut,legacyUntouched}=await app(t,state);
    await signIn();
    await waitFor(()=>text('storageStatus').includes('Online collection loaded'));
    recovering=true; state.loseWrite=true;
    const pending=w.adjustCardCount(sample.id,'normal',1);
    await waitFor(()=>held);
    d.getElementById('btnSignOut').click();
    await waitFor(signedOut);
    await signIn('bob@example.test');
    await waitFor(()=>text('statTotalCopies')==='9');
    const status=text('storageStatus');
    release(); await pending;
    w.openEditModal(sample.id);
    assert.equal(d.getElementById('modalNormal').value,'9');
    assert.equal(text('statTotalCopies'),'9');
    assert.equal(text('authAccount'),'bob@example.test');
    assert.equal(text('storageStatus'),status);
    assert.equal(d.querySelector('#modalCardForm button[type="submit"]').disabled,false);
    assert.ok(legacyUntouched());
    assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,1);
    assert.equal(state.rows.get(`${bob}:${sample.id}`).normal,9);
  });
}

test('capture adds and undoes one online copy through the atomic adjustment', async t=>{
  const state=apiFixture(), {d,text,signIn,legacyUntouched}=await app(t,state);
  await signIn();
  await waitFor(()=>text('storageStatus').includes('Online collection loaded'));
  d.getElementById('btnCapture').click();
  const input=d.getElementById('captureInput');
  input.value=sample.number;
  input.dispatchEvent(new d.defaultView.Event('input'));
  assert.match(text('captureMessage'),/Enter adds this card/);
  input.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Enter'}));
  await waitFor(()=>text('captureCount')==='1');
  assert.equal(text('statTotalCopies'),'1');
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,1);
  d.querySelector('#captureLog [data-undo]').click();
  await waitFor(()=>text('captureCount')==='0');
  assert.equal(text('statTotalCopies'),'0');
  assert.equal(state.rows.get(`${alice}:${sample.id}`).normal,0);
  assert.equal(state.calls.filter(c=>c.path.includes('/rpc/')).length,2);
  assert.ok(legacyUntouched());
});

test('capture never logs an addition that was not written, even for a stale match', async t=>{
  const state=apiFixture(undefined,[collectionRow(alice,sample.id,998)]), {d,text,signIn}=await app(t,state);
  await signIn();
  await waitFor(()=>text('statTotalCopies')==='998');
  d.getElementById('btnCapture').click();
  const input=d.getElementById('captureInput');
  input.value=sample.number;
  input.dispatchEvent(new d.defaultView.Event('input'));
  // Another device reaches the 999 limit; the listed match still shows 998.
  const row=state.rows.get(`${alice}:${sample.id}`); row.normal=999; row.revision++;
  d.getElementById('btnCloudRefresh').click();
  await waitFor(()=>text('statTotalCopies')==='999');
  input.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Enter'}));
  await waitFor(()=>text('captureMessage').includes('Not confirmed'));
  assert.equal(text('captureCount'),'0');
  assert.equal(state.calls.filter(c=>c.path.includes('/rpc/')).length,0);
});

test('registration waits for email confirmation and clears the password without signing in', async t=>{
  const state=apiFixture(), {d,text}=await app(t,state);
  d.getElementById('authEmail').value='alice@example.test';
  d.getElementById('authPassword').value='example-password';
  d.getElementById('btnSignUp').click();
  await waitFor(()=>text('authStatus').includes('Confirm your email address'));
  assert.equal(d.getElementById('authPassword').value,'');
  assert.equal(d.getElementById('authForm').hidden,false);
  assert.equal(d.body.dataset.session,'signed-out');
  assert.equal(text('statTotalCopies'),'0');
  assert.equal(state.calls.filter(c=>c.path.startsWith('/rest/')).length,0);
});
