import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeCatalog} from '../scripts/import-openrift.mjs';
const context=vm.createContext({});
vm.runInContext(await readFile(new URL('../collection.js',import.meta.url),'utf8'),context);
const {merge,snapshot,validateItems}=context.CollectionModel;
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
test('legacy counts migrate without losing totals, custom images or unknown cards',()=>{
 const catalog=normalizeCatalog(fixture()).cards;
 const old=[{id:'OGN-001',number:'OGN-001',name:'Blazing Scorcher',normal:2,foil:3,imageUrl:'data:image/png;base64,AA=='},
  {id:'custom',number:'PRM-001',name:'Custom',normal:4,foil:0}];
 const cards=merge(catalog,old);
 assert.equal(cards.reduce((s,c)=>s+c.normal+c.foil,0),9);
 assert.equal(cards[0].normal,2);
 assert.equal(cards[0].foil,3);
 assert.equal(cards[0].imageUrl,old[0].imageUrl);
 assert.equal(cards[1].migrationReview,true);
 const record=snapshot(cards,catalog);
 assert.equal(record.items[0].rulesText,undefined);
 assert.equal(merge(catalog,record).reduce((s,c)=>s+c.normal+c.foil,0),9);
});
test('new catalog entries appear after a reload while counts persist',()=>{
 const catalog=normalizeCatalog(fixture()).cards;
 catalog[0].normal=2;
 const record=snapshot(catalog,catalog);
 const updated=[...catalog,{...catalog[0],id:'openrift-new',name:'New',normal:0}];
 const merged=merge(updated,record);
 assert.equal(merged.length,2);
 assert.equal(merged[0].normal,2);
 assert.equal(merged[1].normal,0);
});
test('wrong names and ambiguous old variants are kept for review rather than reassigned',()=>{
 const catalog=normalizeCatalog(fixture()).cards;
 const merged=merge(catalog,[{id:'old',number:'OGN-001',name:'Different card',normal:3,foil:0}]);
 assert.equal(merged[0].normal,0);
 assert.equal(merged[1].normal,3);
 assert.equal(merged[1].migrationReview,true);
});
test('invalid or duplicate backup records cannot overwrite a collection',()=>{
 assert.throws(()=>validateItems([{id:'x',name:'X',number:'X',normal:-1}]));
 assert.throws(()=>validateItems([{id:'x',name:'X',number:'X'},{id:'x',name:'X',number:'X'}]));
 assert.throws(()=>merge([],{}));
 assert.throws(()=>normalizeCatalog({sets:[],cards:{},printings:{}}));
});
