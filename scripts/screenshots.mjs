// Screenshots of the live site for the README (run by the "Update README screenshots" workflow).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const site = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
mkdirSync('docs/screenshots', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', deviceScaleFactor: 1 });
const shots = [
  ['home', '/?set=soc'],
  ['dashboard', '/dashboard/'],
  ['coverage', '/coverage/'],
  ['sources', '/sources/'],
];
for (const [name, path] of shots) {
  await page.goto(site + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
  console.log('saved', name);
}
// A job page: open the first result from the home page.
await page.goto(site + '/?set=soc', { waitUntil: 'networkidle' });
const first = page.locator('article h3 a').first();
if (await first.count()) {
  await first.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'docs/screenshots/job.png' });
  console.log('saved job');
}
const dark = await browser.newPage({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' });
await dark.goto(site + '/', { waitUntil: 'networkidle' });
await dark.waitForTimeout(1500);
await dark.screenshot({ path: 'docs/screenshots/home-dark.png' });
await browser.close();
