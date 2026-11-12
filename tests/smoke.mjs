import { chromium } from 'playwright';

const pages = [
  { path: '/', heading: /ClassVerse|M\.4\/11/i },
  { path: '/booking/', heading: /จอง|ที่นั่ง|Booking/i },
  { path: '/seating/', heading: /รู้ตำแหน่ง|ที่นั่ง|Seating/i },
  { path: '/todo/', heading: /ลงมือทำ|งาน|ประกาศ|To-?Do/i }
];

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const route of pages) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const response = await page.goto(`http://127.0.0.1:4173${route.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.waitForTimeout(1200);

    if (!response?.ok()) failures.push(`${route.path}: HTTP ${response?.status() ?? 'no response'}`);
    const heading = page.locator('h1').first();
    if (await heading.count() === 0) {
      failures.push(`${route.path}: missing primary heading`);
    } else {
      const text = await heading.innerText();
      if (!route.heading.test(text)) failures.push(`${route.path}: unexpected heading "${text}"`);
    }
    for (const error of pageErrors) failures.push(`${route.path}: uncaught browser error: ${error}`);

    console.log(`${failures.some(item => item.startsWith(route.path + ':')) ? 'FAILED' : 'PASSED'} ${route.path}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\\n'));
  process.exit(1);
}
console.log('All four pages passed the browser smoke test.');
