// Test of the whole page in a headless browser, against the real Firestore.
// It adds a few records, checks them, and removes them again.
// Build first (npm run build), then: npm run test:browser
// To test the live site instead: HABITS_URL=https://programever.github.io/habits/ npm run test:browser
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Page } from 'playwright';

// Since 2026-10-21 a button is a once-per-day mark: the badge shows a check mark when done, nothing when not.
const done = (page: Page, item: string): Promise<boolean> =>
  page.locator(`.hb[data-item="${item}"] .n`).innerText().then(t => t.trim() !== '');

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
    assert.equal(await page.locator('.hb').count(), 13, '13 buttons');
    // The test must not touch a real mark of today, so it only runs when jog and spend are still empty.
    assert.equal(await done(page, 'jog'), false, 'jog is not marked yet today (else the test would remove the real mark)');
    assert.equal(await done(page, 'spend'), false, 'spend is not marked yet today');

    // press jog once, spend twice: the second press on spend takes the mark away again
    await page.click('.hb[data-item="jog"]');
    await page.click('.hb[data-item="spend"]');
    await page.waitForFunction(() => document.querySelector('.hb[data-item="spend"] .n')!.textContent!.trim() !== '');
    await page.click('.hb[data-item="spend"]');
    await page.waitForFunction(() => document.querySelector('.hb[data-item="jog"] .n')!.textContent!.trim() !== ''
      && document.querySelector('.hb[data-item="spend"] .n')!.textContent!.trim() === '');
    await page.waitForFunction(() => !document.querySelector('#records')!.textContent!.includes('not saved yet'), null, { timeout: 20000 });
    assert.equal(await page.locator('#records li').count(), 1, 'only one record today: jog');

    // a second tab sees the same data
    const page2 = await ctx.newPage();
    await page2.goto(url);
    await page2.waitForSelector('.hb');
    await page2.waitForFunction(() => document.querySelector('.hb[data-item="jog"] .n')!.textContent!.trim() !== '', null, { timeout: 20000 });
    await page2.close();

    await page.screenshot({ path: '/tmp/habits-today.png', fullPage: true });
    await page.click('#tab-report');
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#report').isVisible(), 'report visible');
    assert.equal(await page.locator('.chart').count(), 13, '13 charts');
    await page.screenshot({ path: '/tmp/habits-report.png', fullPage: true });
    await page.click('#tab-today');
    await page.waitForTimeout(200);

    // remove the test record with the × button in the list
    await page.locator('#records button.x').first().click();
    await page.waitForFunction(() => document.querySelector('.hb[data-item="jog"] .n')!.textContent!.trim() === '', null, { timeout: 20000 });

    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await browser.close();
    server?.kill();
  }
});
