import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/config.js', route => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.CLASSROOM_CONFIG = {};'
  }));
  const response = await page.goto('http://127.0.0.1:4173/booking/', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200);
  await page.locator('#seatGrid button.seat').first().waitFor();
  assert.equal(await page.locator('#statTotal').innerText(), '40');
  assert.match(await page.locator('#modeSession').innerText(), /LOCAL DEMO/);

  await page.locator('#seatGrid button.seat[aria-label^="โต๊ะ A1"]').click();
  await page.locator('#studentName').fill('นักเรียน ทดสอบ');
  await page.locator('#studentNo').fill('11');
  await page.locator('#reserveBtn').click();
  await page.locator('#confirmOverlay').waitFor({ state: 'visible' });
  await page.locator('#acceptConfirm').click();
  await page.locator('#successOverlay').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#successSeat').innerText(), 'A1');
  assert.equal(await page.locator('#successName').innerText(), 'นักเรียน ทดสอบ');
  assert.equal(await page.locator('#statBooked').innerText(), '1');

  await page.locator('#successClose').click();
  await page.locator('#adminBtn').click();
  await page.locator('#adminPin').fill('280806');
  await page.locator('#adminLoginForm button[type="submit"]').click();
  await page.locator('#adminBoard').waitFor({ state: 'visible' });
  assert.match(await page.locator('#adminCurrentMode').innerText(), /PUBLIC TEST/);

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 3),
    'booking page should not overflow horizontally on mobile');
  assert.deepEqual(errors, []);
  console.log('Booking demo interaction, reservation confirmation, admin access and mobile layout passed.');
} finally {
  await browser.close();
}
