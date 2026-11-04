const { expect } = require('@playwright/test');

// Serve Supabase Auth and the Data API from the deterministic wire fixture.
async function routeApi(target, state) {
  await target.route('https://jhleumwhywdurherakml.supabase.co/**', async route => {
    const request = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const response = await state.fetch(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() });
    await route.fulfill({ status: response.status, headers: { ...cors, 'content-type': 'application/json' }, body: await response.text() });
  });
}

async function signIn(page, email = 'alice@example.test') {
  await page.locator('#authEmail').fill(email);
  await page.locator('#authPassword').fill('example-password');
  await page.locator('#btnSignIn').click();
  await expect(page.locator('#storageStatus')).toContainText('Online collection loaded');
}

module.exports = { routeApi, signIn };
