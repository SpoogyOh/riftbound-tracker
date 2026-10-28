import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {IDBFactory} from 'fake-indexeddb';
const root=new URL('../',import.meta.url);
const html=await readFile(new URL('index.html',root),'utf8');
const sources=await Promise.all(['cards.js','collection.js','storage.js','app.js'].map(f=>readFile(new URL(f,root),'utf8')));
async function waitFor(predicate) {
  for(let i=0;i<100;i++) { if(predicate())return; await new Promise(r=>setTimeout(r,10)); }
  throw new Error('UI did not settle');
}
async function app(factory,legacy) {
  const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});
  const w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  Object.defineProperty(w,'indexedDB',{value:factory});
  w.structuredClone=structuredClone;
  w.confirm=()=>true;
  if(legacy)w.localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify(legacy));
  sources.forEach(source=>w.eval(source));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(()=>w.document.getElementById('cardTableBody').children.length>1000);
  return dom;
}
test('real catalog initializes; legacy counts, secondary domains, variants and IDB reload work',async()=>{
  const factory=new IDBFactory();
  const dom=await app(factory,[{id:'OGN-001',number:'OGN-001',name:'Blazing Scorcher',normal:2,foil:1},
    {id:'uncertain',number:'OGN-030',name:'Uncertain',normal:3,foil:0}]);
  const w=dom.window,d=w.document;
  assert.equal(d.getElementById('statTotalCopies').textContent,'6');
  const target=w.DEFAULT_RIFTBOUND_CARDS.find(c=>c.number==='OGN-001'&&!c.variant);
  w.adjustCardCount(target.id,'normal',1);
  await waitFor(()=>d.getElementById('storageStatus').textContent.includes('Gespeichert'));
  assert.ok(w.localStorage.getItem('riftbound_card_tracker_v2'));
  const record=await w.CollectionStorage.load();
  assert.equal(record.schemaVersion,3);
  assert.equal(record.items.length,2);
  const fresh=await app(factory);
  assert.equal(fresh.window.document.getElementById('statTotalCopies').textContent,'7');
  fresh.window.close();
  d.getElementById('quickCardInput').value='OGN-001';
  d.getElementById('quickAddForm').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.match(d.getElementById('quickAddFeedback').textContent,/Mehrere Varianten/);
  d.getElementById('filterSet').value='SFD';
  d.getElementById('filterSet').dispatchEvent(new w.Event('change'));
  d.querySelector('[data-domain="Order"]').click();
  const rows=w.getFilteredCards();
  assert.ok(rows.length);
  assert.ok(rows.every(c=>c.set==='SFD'&&c.domains.includes('Order')));
  d.getElementById('viewBtnGrid').click();
  assert.equal(d.getElementById('gridContainer').children.length,rows.length);
  w.openLightbox(target.id);
  assert.ok(d.getElementById('lightboxRules').textContent.length);
  assert.match(d.getElementById('lightboxSource').href,/openrift.app\/cards\//);
  dom.window.close();
});
test('storage falls back visibly and rejects a write when both stores fail',async()=>{
  const dom=new JSDOM('',{url:'http://localhost/',runScripts:'outside-only'});
  const w=dom.window;
  w.eval(sources[2]);
  const record={schemaVersion:3,savedAt:new Date().toISOString(),items:[]};
  assert.match(await w.CollectionStorage.save(record),/Fallback/);
  assert.equal((await w.CollectionStorage.load()).schemaVersion,3);
  Object.defineProperty(w,'localStorage',{value:{setItem(){throw new Error('quota exceeded');}}});
  await assert.rejects(w.CollectionStorage.save(record));
  dom.window.close();
});
