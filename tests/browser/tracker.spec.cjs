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
  await expect(page.locator('#gridContainer > div')).toHaveCount(1894);
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
  await expect(page.locator('#storageStatus')).toContainText('for review');
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const row=page.locator('#gridContainer > div').filter({has:page.locator('input[value="2"]')});
  await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'＋',exact:true}).first().click();
  await expect(page.locator('#storageStatus')).toContainText('Saved · IndexedDB');
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
  await page.locator('#btnAccountMenu').click();
  await page.locator('#btnExportJSON').click();
  const backup=await downloaded;
  const path=await backup.path();
  const json=JSON.parse(await readFile(path,'utf8'));
  expect(json.schemaVersion).toBe(3);
  expect(json.items.reduce((n,c)=>n+c.normal+c.foil,0)).toBe(7);
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('#inputImportJSON').setInputFiles(path);
  await expect(page.locator('#storageStatus')).toContainText('Saved · IndexedDB');
  await expect(page.locator('#statTotalCopies')).toHaveText('7');
  await page.goto('/riftbound_tracker.html');
  await expect(page.locator('#statTotalCopies')).toHaveText('7');
  expect(errors).toEqual([]);
});

test('variant selection, finish limits, filter reset and CSV',async({page})=>{
  await ready(page);
  await page.locator('#btnCapture').click();
  const input=page.locator('#captureInput');
  await expect(input).toBeFocused();
  // Two variants share OGN-001, so Enter alone must not pick one.
  await input.fill('OGN-001');
  await input.press('Enter');
  await expect(page.locator('#captureMessage')).toContainText('2 cards match');
  await expect(page.locator('#captureLog li')).toHaveCount(0);
  await page.locator('#captureCandidates [role="option"]').filter({hasText:'Blazing Scorcher'}).filter({hasNotText:'Promo'}).click();
  await expect(page.locator('#statTotalCopies')).toHaveText('1');
  await input.fill('Blazing Scorcher');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('#statTotalCopies')).toHaveText('2');
  // The promo variant is foil-only.
  await input.fill('OGN-001');
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('#captureMessage')).toContainText('has no normal version');
  await page.locator('#captureFoil').click();
  await input.fill('OGN-001');
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('#statTotalCopies')).toHaveText('3');
  await expect(page.locator('#captureLog li')).toHaveCount(3);
  await page.locator('#btnCaptureDone').click();
  await expect(page.locator('#capturePanel')).toBeHidden();
  await page.locator('#filterSet').selectOption('SFD');
  await page.locator('[data-domain="Order"]').click();
  await page.locator('#viewBtnTable').click();
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
  await page.locator('#btnAccountMenu').click();
  await page.locator('#btnExportCSV').click();
  const csv=await readFile(await (await downloaded).path(),'utf8');
  expect(csv).toContain('Varianten_ID');
  expect(csv).toContain('openrift-');
});

test('desktop and mobile grid, card panel and custom image reset',async({page},testInfo)=>{
  await ready(page);
  await page.locator('#viewBtnTable').click();
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const standard=page.locator('#cardTableBody tr').filter({hasText:'Blazing Scorcher ↗'}).filter({hasNotText:'[Promo]'});
  await standard.locator('button[title="Edit card & image"]').click();
  await page.locator('#modalImageUrl').fill('');
  await page.locator('#modalCardForm button[type="submit"]').click();
  await page.locator('#viewBtnGrid').click();
  await expect(page.locator('#gridContainer')).toBeVisible();
  await page.locator('#gridContainer img').first().click();
  await expect(page.locator('#cardPanel')).toBeVisible();
  await expect(page.locator('#panelRules')).not.toBeEmpty();
  await expect(page.locator('#panelSource')).toHaveAttribute('href',/openrift.app\/cards\//);
  await expect(page.locator('#panelImg')).toHaveAttribute('src',/openrift.app\/media\/cards\//);
  await page.locator('#btnClosePanel').click();
  await page.screenshot({path:testInfo.outputPath('desktop-grid.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#gridContainer')).toBeVisible();
  await page.locator('#gridContainer img').first().click();
  await expect(page.locator('#panelNormalPlus')).toBeVisible();
  await page.locator('#panelNormalPlus').click();
  await expect(page.locator('#storageStatus')).toContainText('Saved');
  await page.screenshot({path:testInfo.outputPath('mobile-panel.png')});
});

test('one real OpenRift image responds with image data',async({page,request})=>{
  await ready(page);
  const url=await page.locator('#gridContainer img').first().getAttribute('src');
  const response=await request.get(url,{timeout:30000});
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/^image\//);
  expect((await response.body()).length).toBeGreaterThan(100);
});

test('header: slash focuses search; account menu opens and closes',async({page})=>{
  await ready(page);
  await page.keyboard.press('/');
  await expect(page.locator('#searchInput')).toBeFocused();
  await expect(page.locator('#searchInput')).toHaveValue('');
  await expect(page.locator('#authEmail')).toBeHidden();
  await page.locator('#btnAccountMenu').click();
  await expect(page.locator('#authEmail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#authEmail')).toBeHidden();
});

test('binder is the default view; filters sit in a sidebar on desktop and a sheet on mobile',async({page})=>{
  await ready(page);
  await expect(page.locator('#viewBtnGrid')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#tableContainer')).toBeHidden();
  await expect(page.locator('[data-domain="Fury"]')).toBeVisible();
  await expect(page.locator('#btnOpenFilters')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('[data-domain="Fury"]')).toBeHidden();
  await page.locator('#btnOpenFilters').click();
  await page.locator('[data-domain="Fury"]').click();
  await expect(page.locator('[data-domain="Fury"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#filterCount')).toHaveText('[1]');
  const tiles=page.locator('#gridContainer > div');
  expect(await tiles.count()).toBeLessThan(1894);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-domain="Fury"]')).toBeHidden();
  await expect(tiles.first()).toContainText('Fury');
});

test('card panel stays beside the binder: arrows browse, counts save, Esc closes',async({page})=>{
  await ready(page);
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const tiles=page.locator('#gridContainer > div');
  await expect(tiles).toHaveCount(2);
  await tiles.nth(0).locator('img').click();
  await expect(page.locator('#cardPanel')).toBeVisible();
  await expect(page.locator('#panelName')).toHaveText('Blazing Scorcher');
  await expect(tiles.nth(0)).toHaveClass(/is-active/);
  await expect(page.locator('#btnPanelPrev')).toBeDisabled();
  // Non-modal: the binder stays usable, and the panel has room beside it.
  const panelBox=await page.locator('#cardPanel').boundingBox();
  const gridBox=await page.locator('#gridContainer').boundingBox();
  expect(gridBox.x+gridBox.width).toBeLessThanOrEqual(panelBox.x);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#panelName')).toHaveText('Blazing Scorcher [Promo]');
  await expect(page.locator('#btnPanelNext')).toBeDisabled();
  await expect(page.locator('#panelNormalPlus')).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#panelName')).toHaveText('Blazing Scorcher');
  await page.locator('#panelNormalPlus').click();
  await expect(page.locator('#storageStatus')).toContainText('Saved');
  await expect(page.locator('#panelNormalVal')).toHaveText('1');
  await expect(tiles.nth(0).locator('input').first()).toHaveValue('1');
  await tiles.nth(1).locator('img').click();
  await expect(page.locator('#panelName')).toHaveText('Blazing Scorcher [Promo]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#cardPanel')).toBeHidden();
  await expect(page.locator('#gridContainer .is-active')).toHaveCount(0);
});

test('capture adds one copy per Enter, never creates cards from unknown input, and undoes',async({page})=>{
  await ready(page);
  const number=await page.evaluate(()=>{
    const counts={};
    for(const c of window.DEFAULT_RIFTBOUND_CARDS) counts[c.number]=(counts[c.number]||0)+1;
    return window.DEFAULT_RIFTBOUND_CARDS.find(c=>counts[c.number]===1&&c.finishes?.includes('normal')).number;
  });
  await page.locator('#btnCapture').click();
  const input=page.locator('#captureInput');
  await input.fill('Zzz not a card');
  await input.press('Enter');
  await expect(page.locator('#captureMessage')).toContainText('No card found');
  await expect(page.locator('#statTotalCopies')).toHaveText('0');
  for (let i=0;i<2;i++) {
    await input.fill(number);
    await input.press('Enter');
    await expect(input).toHaveValue('');
  }
  await expect(page.locator('#statTotalCopies')).toHaveText('2');
  await expect(page.locator('#captureCount')).toHaveText('2');
  await page.locator('#captureLog [data-undo]').first().click();
  await expect(page.locator('#statTotalCopies')).toHaveText('1');
  await expect(page.locator('#captureLog li')).toHaveCount(1);
  await expect(page.locator('#storageStatus')).toContainText('Saved');
  await page.keyboard.press('Escape');
  await expect(page.locator('#capturePanel')).toBeHidden();
  await page.locator('#btnCapture').click();
  await expect(page.locator('#captureLog li')).toHaveCount(0);
});
