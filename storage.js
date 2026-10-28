(function (root) {
  const KEY = 'riftbound_card_tracker_v3';
  let database;
  let queue=Promise.resolve();
  function open() {
    if (!database) database=new Promise((resolve,reject)=>{
      if (!root.indexedDB) return reject(new Error('IndexedDB nicht verfügbar.'));
      const request=root.indexedDB.open('riftbound-tracker',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('collection');
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Bitte andere Tracker-Tabs schließen.'));
      request.onsuccess=()=>resolve(request.result);
    });
    return database;
  }
  async function readDatabase() {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('collection','readonly');
      const request=tx.objectStore('collection').get('current');
      tx.oncomplete=()=>resolve(request.result);
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error || new Error('Lesen abgebrochen.'));
    });
  }
  async function writeDatabase(record) {
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('collection','readwrite');
      tx.objectStore('collection').put(record,'current');
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error || new Error('Speichern abgebrochen.'));
    });
  }
  async function load() {
    let record;
    let local;
    let localError;
    try { const raw=localStorage.getItem(KEY); if(raw) local=JSON.parse(raw); } catch(error) { localError=error; }
    try { record=await readDatabase(); } catch(error) {
      // A transient read failure must not resurrect an older legacy collection.
      if (root.indexedDB && !local) throw error;
      console.warn(error.message);
    }
    if(local && (!record || local.savedAt > record.savedAt)) record=local;
    if(record) return record;
    if(localError) throw localError;
    // Legacy keys are read, never deleted or overwritten during migration.
    for(const key of ['riftbound_card_tracker_v2','riftbound_card_tracker_v1']) {
      const raw=localStorage.getItem(key);
      if(raw) return JSON.parse(raw);
    }
    return [];
  }
  function save(record) {
    const pending=queue.catch(()=>{}).then(async()=>{
      try {
        await writeDatabase(record);
        // Remove an older fallback only after the IndexedDB transaction committed.
        try { localStorage.removeItem(KEY); } catch {}
        return 'IndexedDB';
      } catch(error) {
        localStorage.setItem(KEY,JSON.stringify(record));
        return 'Browser-Speicher (Fallback)';
      }
    });
    queue=pending;
    return pending;
  }
  root.CollectionStorage={load,save};
})(window);
