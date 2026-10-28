const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

test.beforeEach(async ({ page }) => {
  // Keep tests gentle on the community image host: deterministic placeholders,
  // with one explicitly bounded real-image check in a separate test below.
  await page.route('https://openrift.app/media/cards/**', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="350"><rect width="250" height="350" fill="#273147"/></svg>'
  }));
});

async function ready(page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#cardTableBody tr')).toHaveCount(1894);
}

test('legacy migration, native IndexedDB, JSON round trip and standalone', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('browser-test-seeded')) {
      localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify([
        {id:'OGN-001',number:'OGN-001',name:'Blazing Scorcher',normal:2,foil:1},
        {id:'legacy-unknown',number:'OGN-030',name:'Uncertain',normal:3,foil:0}
      ]));
      localStorage.setItem('browser-test-seeded','1');
    }
  });
  await page.goto('/');
  await expect(page.locator('#statTotalCopies')).toHaveText('6');
  await expect(page.locator('#storageStatus')).toContainText('zur Prüfung');
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const row=page.locator('#cardTableBody tr').filter({has:page.locator('input[value="2"]')});
  await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'＋',exact:true}).first().click();
  await expect(page.locator('#storageStatus')).toContainText('Gespeichert · IndexedDB');
  await page.reload();
  await expect(page.locator('#statTotalCopies')).toHaveText('7');
  const record=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('riftbound-tracker');
    r.onerror=()=>reject(r.error);
    r.onsuccess=()=>{
      const q=r.result.transaction('collection').objectStore('collection').get('current');
      q.onsuccess=()=>{r.result.close();resolve(q.result);};
      q.onerror=()=>reject(q.error);
    };
  }));
  expect(record.schemaVersion).toBe(3);
  expect(record.items).toHaveLength(2);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('riftbound_card_tracker_v2'))[0].normal)).toBe(2);
  const downloaded=page.waitForEvent('download');
  await page.locator('#btnExportJSON').click();
  const backup=await downloaded;
  const path=await backup.path();
  const json=JSON.parse(await readFile(path,'utf8'));
  expect(json.schemaVersion).toBe(3);
  expect(json.items.reduce((n,c)=>n+c.normal+c.foil,0)).toBe(7);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#inputImportJSON').setInputFiles(path);
  await expect(page.locator('#storageStatus')).toContainText('Gespeichert · IndexedDB');
  await expect(page.locator('#statTotalCopies')).toHaveText('7');
  await page.goto('/riftbound_tracker.html');
  await expect(page.locator('#statTotalCopies')).toHaveText('7');
  expect(errors).toEqual([]);
});

test('variant selection, finish limits, filter reset and CSV',async({page})=>{
  await ready(page);
  await page.locator('#quickCardInput').fill('OGN-001');
  await page.locator('#quickAddForm button[type="submit"]').click();
  await expect(page.locator('#quickAddFeedback')).toContainText('Mehrere Varianten');
  const choice=await page.locator('#catalogAutocomplete option').evaluateAll(options=>options.find(o=>o.value.startsWith('OGN-001 – Blazing Scorcher | ')).value);
  await page.locator('#quickCardInput').fill(choice);
  await page.locator('#quickNormalDelta').fill('2');
  await page.locator('#quickFoilDelta').fill('1');
  await page.locator('#quickAddForm button[type="submit"]').click();
  await expect(page.locator('#statTotalCopies')).toHaveText('3');
  await page.locator('#filterSet').selectOption('SFD');
  await page.locator('[data-domain="Order"]').click();
  const rows=page.locator('#cardTableBody tr');
  expect(await rows.count()).toBeGreaterThan(0);
  const domains=await rows.locator('td:nth-child(2)').allTextContents();
  expect(domains.every(d=>d.includes('Order'))).toBe(true);
  await page.locator('#btnResetFilters').click();
  await expect(rows).toHaveCount(1894);
  await page.locator('#searchInput').fill('Blazing Scorcher');
  // Promo foil-only variant must not offer a normal counter.
  const promo=page.locator('#cardTableBody tr').filter({hasText:'[Promo]'});
  await expect(promo.locator('input').first()).toBeDisabled();
  const downloaded=page.waitForEvent('download');
  await page.locator('#btnExportCSV').click();
  const csv=await readFile(await (await downloaded).path(),'utf8');
  expect(csv).toContain('Varianten_ID');
  expect(csv).toContain('openrift-');
});

test('desktop and mobile grid, lightbox and custom image reset',async({page},testInfo)=>{
  await ready(page);
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const standard=page.locator('#cardTableBody tr').filter({hasText:'Blazing Scorcher ↗'}).filter({hasNotText:'[Promo]'});
  await standard.locator('button[title="Karte & Bild bearbeiten"]').click();
  await page.locator('#modalImageUrl').fill('');
  await page.locator('#modalCardForm button[type="submit"]').click();
  await page.locator('#viewBtnGrid').click();
  await expect(page.locator('#gridContainer')).toBeVisible();
  await page.locator('#gridContainer img').first().click();
  await expect(page.locator('#lightboxModal')).toBeVisible();
  await expect(page.locator('#lightboxRules')).not.toBeEmpty();
  await expect(page.locator('#lightboxSource')).toHaveAttribute('href',/openrift.app\/cards\//);
  await expect(page.locator('#lightboxImg')).toHaveAttribute('src',/openrift.app\/media\/cards\//);
  await page.locator('#btnCloseLightbox').click();
  await page.screenshot({path:testInfo.outputPath('desktop-grid.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#gridContainer')).toBeVisible();
  await page.locator('#gridContainer img').first().click();
  await expect(page.locator('#lbNormalPlus')).toBeVisible();
  await page.locator('#lbNormalPlus').click();
  await expect(page.locator('#storageStatus')).toContainText('Gespeichert');
  await page.screenshot({path:testInfo.outputPath('mobile-lightbox.png')});
});

test('one real OpenRift image responds with image data',async({page,request})=>{
  await ready(page);
  const url=await page.locator('#cardTableBody img').first().getAttribute('src');
  const response=await request.get(url,{timeout:30000});
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^image\//);
  expect((await response.body()).length).toBeGreaterThan(100);
});
