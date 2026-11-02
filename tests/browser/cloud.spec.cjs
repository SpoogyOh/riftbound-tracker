const { test, expect } = require('@playwright/test');

test('two browser sessions share confirmed counts; conflicts and logout preserve local data', async ({browser},testInfo)=>{
  const {apiFixture,sample}=await import('../cloud-fixture.mjs');
  const state=apiFixture();
  const contexts=[];
  async function device() {
    const context=await browser.newContext({baseURL:'http://127.0.0.1:8765',viewport:{width:1440,height:1000}}); contexts.push(context);
    await context.route('https://jhleumwhywdurherakml.supabase.co/**',async route=>{
      const request=route.request();
      const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
      if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
      const response=await state.fetch(request.url(),{method:request.method(),headers:await request.allHeaders(),body:request.postData()});
      await route.fulfill({status:response.status,headers:{...cors,'content-type':'application/json'},body:await response.text()});
    });
    await context.route('https://openrift.app/media/cards/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
    await context.addInitScript(({id})=>{
      localStorage.setItem('riftbound_card_tracker_v2',JSON.stringify([{id,source:'OpenRift',normal:5,foil:0}]));
    },{id:sample.id});
    const page=await context.newPage();
    await page.goto('/');
    await expect(page.locator('#authStatus')).toContainText('Lokale Sammlung');
    await expect(page.locator('#statTotalCopies')).toHaveText('5');
    await page.locator('#authEmail').fill('alice@example.test');
    await page.locator('#authPassword').fill('example-password');
    await page.locator('#btnSignIn').click();
    await expect(page.locator('#storageStatus')).toContainText('Online-Sammlung geladen');
    await expect(page.locator('#cardTableBody tr')).toHaveCount(1);
    return page;
  }
  try {
    const first=await device(), second=await device();
    await first.locator('#cardTableBody button').filter({hasText:'＋'}).first().click();
    await expect(first.locator('#statTotalCopies')).toHaveText('1');
    await second.locator('#cardTableBody button').filter({hasText:'＋'}).first().click();
    await expect(second.locator('#statTotalCopies')).toHaveText('2');
    // The first device still has revision 1, so its absolute edit must be rejected.
    await first.locator('#cardTableBody input').first().fill('7');
    await first.locator('#cardTableBody input').first().press('Tab');
    await expect(first.locator('#storageStatus')).toContainText('Aktueller Serverstand geladen');
    await expect(first.locator('#statTotalCopies')).toHaveText('2');
    await expect(first.locator('#inputImportJSON')).toBeDisabled();
    await first.screenshot({path:testInfo.outputPath('online-collection.png')});
    await first.reload();
    await expect(first.locator('#storageStatus')).toContainText('Online-Sammlung geladen');
    await expect(first.locator('#statTotalCopies')).toHaveText('2');
    await first.locator('#btnSignOut').click();
    await expect(first.locator('#authStatus')).toContainText('Lokale Sammlung');
    await expect(first.locator('#statTotalCopies')).toHaveText('5');
  } finally { await Promise.all(contexts.map(context=>context.close())); }
});
