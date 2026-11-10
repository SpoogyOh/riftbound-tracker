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
test('other languages join the English variant without changing its ID; unclear matches stay separate',()=>{
 const raw=fixture();
 const english=normalizeCatalog(raw).cards[0];
 raw.enums={languages:[{slug:'EN',sortOrder:1},{slug:'FR',sortOrder:2},{slug:'SC',sortOrder:3}]};
 for(const [key,language,image] of [['n','SC','sc'],['f','SC','sc'],['f','FR','fr']]) raw.printings[key+language]={...raw.printings[key],language,
  printedName:`Name ${language}`,publicCode:`${language}-001`,images:[{imageId:image}]};
 const [joined]=normalizeCatalog(raw).cards;
 assert.equal(normalizeCatalog(raw).cards.length,1);
 assert.equal(joined.id,english.id);
 assert.equal(joined.name,'Blazing Scorcher');
 assert.deepEqual(joined.finishes,english.finishes);
 // French exists only as foil here: it still joins, because English has that finish.
 assert.deepEqual(joined.languages,['EN','FR','SC']);
 assert.deepEqual(joined.localized,{FR:{name:'Name FR',imageUrl:'https://openrift.app/media/cards/fr-400w.webp'},SC:{name:'Name SC',imageUrl:'https://openrift.app/media/cards/sc-400w.webp'}});
 assert.equal(joined.sourcePrintingIds.length,5);
 // A finish that English lacks, or a language without an English printing, becomes its own labelled variant.
 raw.printings.metal={...raw.printings.n,language:'KR',finish:'normal'};
 raw.printings.extra={...raw.printings.n,language:'KR',finish:'foil',shortCode:'OGN-999'};
 delete raw.printings.n;
 const cards=normalizeCatalog(raw).cards;
 assert.deepEqual(cards.map(c=>[c.number,c.variant,c.languages.join()]).sort(),
  [['OGN-001','','EN,FR'],['OGN-001','KR','KR'],['OGN-001','SC','SC'],['OGN-999','KR','KR']]);
 assert.equal(cards.find(c=>c.languages[0]==='EN').id,english.id);
 assert.equal(new Set(cards.flatMap(c=>c.sourcePrintingIds)).size,6);
});
