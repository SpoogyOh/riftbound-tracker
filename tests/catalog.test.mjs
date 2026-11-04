import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCatalog} from '../scripts/import-openrift.mjs';
const fixture=()=>({sets:[{id:'s',slug:'OGN',name:'Origins'}],cards:{c:{name:'Blazing Scorcher',slug:'blazing-scorcher',types:['unit'],superTypes:[],domains:['fury','chaos']}},printings:{
 n:{cardId:'c',setId:'s',language:'EN',shortCode:'OGN-001',publicCode:'OGN-001/298',printedName:'Blazing Scorcher',finish:'normal',rarity:'common',artVariant:'normal',markers:[],size:'standard',images:[]},
 f:{cardId:'c',setId:'s',language:'EN',shortCode:'OGN-001',publicCode:'OGN-001/298',printedName:'Blazing Scorcher',finish:'foil',rarity:'common',artVariant:'normal',markers:[],size:'standard',images:[]}
}});
test('normal/foil twins share a variant; promos and unusual same-finish printings stay distinct',()=>{
 const raw=fixture();
 const paired=normalizeCatalog(raw).cards;
 assert.equal(paired.length,1);
 assert.equal(paired[0].sourcePrintingIds.length,2);
 assert.deepEqual(paired[0].domains,['Fury','Chaos']);
 raw.printings.p={...raw.printings.f,markers:['promo']};
 assert.equal(normalizeCatalog(raw).cards.length,2);
 raw.printings.duplicate={...raw.printings.n};
 const split=normalizeCatalog(raw).cards;
 assert.equal(split.length,4);
 assert.equal(new Set(split.map(c=>c.id)).size,4);
});
test('IDs are deterministic across response ordering and import dates',()=>{
 const raw=fixture();
 const first=normalizeCatalog(raw,'2026-10-28').cards[0].id;
 raw.printings=Object.fromEntries(Object.entries(raw.printings).reverse());
 assert.equal(normalizeCatalog(raw,'2026-10-29').cards[0].id,first);
});
test('an empty OpenRift response is rejected',()=>{
 assert.throws(()=>normalizeCatalog({sets:[],cards:{},printings:{}}));
});
