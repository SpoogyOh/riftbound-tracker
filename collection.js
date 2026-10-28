(function (root) {
  const count = n => Math.max(0, Math.min(999, Number.parseInt(n, 10) || 0));
  const nameKey = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
  const customCard = c => ({ ...c, id: String(c.id), name: String(c.name), number: String(c.number),
    domain: c.domain || 'Neutral', set: c.set || 'PRM', type: c.type || 'Unit', rarity: c.rarity || 'Common',
    normal: count(c.normal), foil: count(c.foil) });

  function validateItems(items) {
    if (!Array.isArray(items)) throw new Error('Backup enthält keine Kartenliste.');
    const ids = new Set();
    for (const c of items) {
      if (!c || typeof c.id !== 'string' || ids.has(c.id) || /["'<>]/.test(c.id)) throw new Error('Ungültige oder doppelte Karten-ID.');
      ids.add(c.id);
      for (const field of ['normal','foil']) {
        if (c[field] !== undefined && (!Number.isInteger(c[field]) || c[field] < 0 || c[field] > 999)) throw new Error('Ungültiger Kartenbestand.');
      }
      if (!c.id.startsWith('openrift-') && (typeof c.name !== 'string' || typeof c.number !== 'string')) throw new Error('Kartenname oder Nummer fehlt.');
    }
    return items;
  }

  function merge(catalog, record) {
    if (!Array.isArray(record) && (!record || record.schemaVersion !== 3 || !Array.isArray(record.items))) throw new Error('Ungültiges Sammlungsformat.');
    const items = validateItems(Array.isArray(record) ? record : record.items);
    const cards = catalog.map(c => ({...c, normal:0, foil:0}));
    const byId = new Map(cards.map(c=>[c.id,c]));
    for (const old of items) {
      let match = byId.get(old.id);
      // Provider IDs remain useful if the provider later splits a formerly paired variant.
      if (!match && old.sourcePrintingIds?.length) {
        const candidates = cards.filter(c=>c.sourcePrintingIds?.some(id=>old.sourcePrintingIds.includes(id)));
        if (candidates.length === 1) match = candidates[0];
      }
      if (!match && !old.id.startsWith('openrift-')) {
        const candidates = cards.filter(c => c.number === old.number && nameKey(c.name) === nameKey(old.name)
          && !c.variant && !c.specialFinish && c.printings?.every(p=>p.size==='standard'));
        if (candidates.length === 1) match = candidates[0];
      }
      if (match) {
        // Multiple legacy entries mapping to one printing are added, never overwritten.
        const n = (match.normal || 0) + count(old.normal), f = (match.foil || 0) + count(old.foil);
        const supported = !match.finishes || ((!n || match.finishes.includes('normal') || match.specialFinish) && (!f || match.finishes.includes('foil')));
        if (n > 999 || f > 999 || !supported) match = null;
        else {
          match.normal=n; match.foil=f;
          if (old.imageOverride || (!old.source && old.imageUrl)) match.imageUrl=old.imageOverride || old.imageUrl;
        }
      }
      if (!match && (old.normal || old.foil || !old.source)) {
        cards.push({...customCard(old), source:undefined, migrationReview: true,
          name: old.name || `Nicht zugeordneter Bestand ${old.id}`, number: old.number || old.id});
      }
    }
    return cards;
  }

  function snapshot(cards, catalog) {
    const byId=new Map(catalog.map(c=>[c.id,c]));
    const items=cards.flatMap(c=>{
      const base=byId.get(c.id);
      if (!base) return [{...c}];
      const imageOverride=c.imageUrl !== base.imageUrl ? c.imageUrl : undefined;
      if (!c.normal && !c.foil && !imageOverride) return [];
      return [{id:c.id,source:'OpenRift',sourcePrintingIds:c.sourcePrintingIds,name:c.name,number:c.number,
        normal:count(c.normal),foil:count(c.foil),imageOverride}];
    });
    return {schemaVersion:3,savedAt:new Date().toISOString(),items};
  }
  root.CollectionModel = {merge,snapshot,validateItems};
})(typeof window !== 'undefined' ? window : globalThis);
