const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { routeApi, signIn } = require('./online.cjs');

// Each test signs in to a fresh fixture account that serves the full bundled catalog.
let fixture, api;
test.beforeEach(async ({ page }) => {
  fixture = await import('../cloud-fixture.mjs');
  api = fixture.apiFixture(fixture.fullCatalog);
  await routeApi(page, api);
  // Keep tests gentle on the community image host: deterministic placeholders,
  // with one explicitly bounded real-image check in a separate test below.
  await page.route('https://openrift.app/media/cards/**', route => route.fulfill({
    status: 200, contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="350"><rect width="250" height="350" fill="#273147"/></svg>'
  }));
});

async function ready(page) {
  await page.goto('/');
  await signIn(page);
  await expect(page.locator('#gridContainer > div')).toHaveCount(1894);
}

test('signed out shows only the sign-in screen; the account collection loads, reloads and exports; old local data stays', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.addInitScript(()=>{
    if(!localStorage.getItem('browser-test-seeded')) {
      localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify([{id:'OGN-001',number:'OGN-001',name:'Blazing Scorcher',normal:2,foil:1}]));
      localStorage.setItem('browser-test-seeded','1');
    }
  });
  const card=fixture.fullCatalog.find(c=>c.number==='OGN-001'&&c.finishes.includes('normal'));
  api.rows.set(`${fixture.alice}:${card.id}`,{...fixture.collectionRow(fixture.alice,card.id,4),foil:1});
  await page.goto('/');
  await expect(page.locator('#signInScreen')).toBeVisible();
  await expect(page.locator('#gridContainer')).toBeHidden();
  await expect(page.locator('#btnCapture')).toBeHidden();
  await signIn(page);
  await expect(page.locator('#signInScreen')).toBeHidden();
  // Only the account's five copies count; the three old local copies are not read.
  await expect(page.locator('#statTotalCopies')).toHaveText('5');
  await page.reload();
  await expect(page.locator('#storageStatus')).toContainText('Online collection loaded');
  await expect(page.locator('#statTotalCopies')).toHaveText('5');
  const downloaded=page.waitForEvent('download');
  await page.locator('#btnAccountMenu').click();
  await page.locator('#btnExportJSON').click();
  const json=JSON.parse(await readFile(await (await downloaded).path(),'utf8'));
  expect(json.schemaVersion).toBe(3);
  expect(json.items).toHaveLength(1);
  expect(json.items[0].normal+json.items[0].foil).toBe(5);
  await page.locator('#btnAccountMenu').click();
  await page.locator('#btnSignOut').click();
  await expect(page.locator('#signInScreen')).toBeVisible();
  await expect(page.locator('#accountMenu')).toBeHidden();
  await expect(page.locator('#gridContainer')).toBeHidden();
  expect(await page.evaluate(()=>localStorage.getItem('riftbound_card_tracker_v2'))).toContain('Blazing Scorcher');
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
  await page.locator('#gridContainer .card-aspect img').first().click();
  await expect(page.locator('#cardPanel')).toBeVisible();
  await expect(page.locator('#panelRules')).not.toBeEmpty();
  await expect(page.locator('#panelSource')).toHaveAttribute('href',/openrift.app\/cards\//);
  await expect(page.locator('#panelImg')).toHaveAttribute('src',/openrift.app\/media\/cards\//);
  await page.locator('#btnClosePanel').click();
  await page.screenshot({path:testInfo.outputPath('desktop-grid.png')});
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#gridContainer')).toBeVisible();
  await page.locator('#gridContainer .card-aspect img').first().click();
  await expect(page.locator('#panelNormalPlus')).toBeVisible();
  await page.locator('#panelNormalPlus').click();
  await expect(page.locator('#storageStatus')).toContainText('Saved');
  await page.screenshot({path:testInfo.outputPath('mobile-panel.png')});
});

test('one real OpenRift image responds with image data',async({page,request})=>{
  await ready(page);
  const url=await page.locator('#gridContainer .card-aspect img').first().getAttribute('src');
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
  await expect(page.locator('#btnSignOut')).toBeHidden();
  await page.locator('#btnAccountMenu').click();
  await expect(page.locator('#accountLabel')).toHaveText('alice@example.test');
  await expect(page.locator('#btnSignOut')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btnSignOut')).toBeHidden();
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
  // Tiles no longer print the domain, so check the first result against the catalog.
  const firstId=await tiles.first().getAttribute('data-card-id');
  expect(fixture.fullCatalog.find(c=>c.id===firstId).details.domains).toContain('Fury');
});

test('card panel stays beside the binder: arrows browse, counts save, Esc closes',async({page})=>{
  await ready(page);
  await page.locator('#searchInput').fill('Blazing Scorcher');
  const tiles=page.locator('#gridContainer > div');
  await expect(tiles).toHaveCount(2);
  await tiles.nth(0).locator('.card-aspect img').click();
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
  await tiles.nth(1).locator('.card-aspect img').click();
  await expect(page.locator('#panelName')).toHaveText('Blazing Scorcher [Promo]');
  await page.keyboard.press('Escape');
  await expect(page.locator('#cardPanel')).toBeHidden();
  await expect(page.locator('#gridContainer .is-active')).toHaveCount(0);
});

test('capture adds one copy per Enter, ignores unknown input, and undoes',async({page})=>{
  await ready(page);
  const counts={};
  for(const c of fixture.fullCatalog) counts[c.number]=(counts[c.number]||0)+1;
  const number=fixture.fullCatalog.find(c=>counts[c.number]===1&&c.finishes.includes('normal')).number;
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
