const { test, expect } = require('@playwright/test');
const { routeApi, signIn } = require('./online.cjs');

test('two browser sessions share confirmed counts; conflicts are caught; signing out returns to the sign-in screen', async ({browser},testInfo)=>{
  const {apiFixture}=await import('../cloud-fixture.mjs');
  const state=apiFixture();
  const contexts=[];
  async function device() {
    const context=await browser.newContext({baseURL:'http://127.0.0.1:8765',viewport:{width:1440,height:1000}}); contexts.push(context);
    await routeApi(context,state);
    await context.route('https://openrift.app/media/cards/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
    const page=await context.newPage();
    await page.goto('/');
    await expect(page.locator('#signInScreen')).toBeVisible();
    await signIn(page);
    await expect(page.locator('#gridContainer > div')).toHaveCount(1);
    await expect(page.locator('#accountLabel')).toHaveText('alice@example.test');
    return page;
  }
  try {
    const first=await device(), second=await device();
    await first.locator('#gridContainer button').filter({hasText:'＋'}).first().click();
    await expect(first.locator('#statTotalCopies')).toHaveText('1');
    // The second device counts through the card panel.
    await second.locator('#gridContainer .card-aspect img').first().click();
    await second.locator('#panelNormalPlus').click();
    await expect(second.locator('#statTotalCopies')).toHaveText('2');
    // The first device still has revision 1, so its absolute edit must be rejected.
    await first.locator('#gridContainer input').first().fill('7');
    await first.locator('#gridContainer input').first().press('Tab');
    await expect(first.locator('#storageStatus')).toContainText('Loaded the current server state');
    await expect(first.locator('#statTotalCopies')).toHaveText('2');
    await first.screenshot({path:testInfo.outputPath('online-collection.png')});
    await first.reload();
    await expect(first.locator('#storageStatus')).toContainText('Online collection loaded');
    await expect(first.locator('#statTotalCopies')).toHaveText('2');
    await first.locator('#btnAccountMenu').click();
    await first.locator('#btnSignOut').click();
    await expect(first.locator('#signInScreen')).toBeVisible();
    await expect(first.locator('#gridContainer')).toBeHidden();
  } finally { await Promise.all(contexts.map(context=>context.close())); }
});
