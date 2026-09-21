// Test of the whole page in a headless browser, against the real Firestore.
// It adds a few records, checks them, and removes them again.
// Build first (npm run build), then: npm run test:browser
// To test the live site instead: HABITS_URL=https://programever.github.io/habits/ npm run test:browser
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from 'playwright';

const count = (page: Page, item: string): Promise<number> =>
  page.locator(`.hb[data-item="${item}"] .n`).innerText().then(Number);

test('the page saves, shows and removes records', async () => {
  let url = process.env['HABITS_URL'];
  let server: ChildProcess | null = null;
  if (!url) {
    server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 800));
    url = 'http://127.0.0.1:8765/index.html';
  }
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Ho_Chi_Minh', deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(url);
    await page.waitForSelector('.hb');
    await page.waitForFunction(() => !document.querySelector('#records')!.textContent!.includes('Loading'), null, { timeout: 20000 });
    assert.equal(await page.locator('.hb').count(), 10, '10 buttons');
    const jog0 = await count(page, 'jog'), spend0 = await count(page, 'spend');

    // press jog once, spend twice
    await page.click('.hb[data-item="jog"]');
    await page.click('.hb[data-item="spend"]');
    await page.click('.hb[data-item="spend"]');
    await page.waitForFunction(([j, s]) => Number(document.querySelector('.hb[data-item="jog"] .n')!.textContent) === j! + 1
      && Number(document.querySelector('.hb[data-item="spend"] .n')!.textContent) === s! + 2, [jog0, spend0]);
    await page.waitForFunction(() => !document.querySelector('#records')!.textContent!.includes('not saved yet'), null, { timeout: 20000 });

    // a second tab sees the same data
    const page2 = await ctx.newPage();
    await page2.goto(url);
    await page2.waitForSelector('.hb');
    await page2.waitForFunction(([j]) => Number(document.querySelector('.hb[data-item="jog"] .n')!.textContent) === j! + 1, [jog0], { timeout: 20000 });
    await page2.close();

    await page.screenshot({ path: '/tmp/habits-today.png', fullPage: true });
    await page.click('#tab-report');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#report').isVisible(), 'report visible');
    assert.equal(await page.locator('.chart').count(), 10, '10 charts');
    await page.screenshot({ path: '/tmp/habits-report.png', fullPage: true });
    await page.click('#tab-today');
    await page.waitForTimeout(200);

    // remove the three test records (the newest three lines in the list)
    for (let i = 0; i < 3; i++) {
      await page.locator('#records button.x').first().click();
      await page.waitForTimeout(400);
    }
    await page.waitForFunction(([j, s]) => Number(document.querySelector('.hb[data-item="jog"] .n')!.textContent) === j
      && Number(document.querySelector('.hb[data-item="spend"] .n')!.textContent) === s, [jog0, spend0], { timeout: 20000 });

    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server?.kill();
  }
});
