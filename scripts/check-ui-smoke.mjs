// Short, on-demand browser smoke. The required quality gate runs in the normal CI.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dir = process.env.UI_QA_TOOLS;
const output = process.env.UI_OUTPUT_DIR;
if (!dir || !output) throw new Error('Set UI_QA_TOOLS and UI_OUTPUT_DIR.');
const requireTool = createRequire(resolve(dir, 'package.json'));
const { chromium } = requireTool('playwright');
const axePath = requireTool.resolve('axe-core/axe.min.js');
const base = process.env.UI_BASE_URL ?? 'http://127.0.0.1:3000';
const results = [];

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    if ((await fetch(base + '/en')).ok) break;
  } catch {
    // The production server is starting.
  }
  if (attempt === 39) throw new Error('Demo server did not start.');
  await delay(250);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch(
  process.env.UI_BROWSER_CHANNEL ? { channel: process.env.UI_BROWSER_CHANNEL } : {}
);

async function scenario(name, viewport, test) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await test(page);
    assert.deepEqual(errors, [], 'Unexpected browser errors');
    results.push({ name, passed: true });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
    await page.screenshot({ path: resolve(output, name + '.png') }).catch(() => {});
    console.error('FAIL ' + name + ': ' + String(error));
  } finally {
    await context.close();
  }
}

async function noOverflow(page) {
  const [client, scroll] = await page.evaluate(() => {
    const root = globalThis.document.documentElement;
    return [root.clientWidth, root.scrollWidth];
  });
  assert.ok(scroll <= client + 1, 'Horizontal overflow');
}

async function accessible(page) {
  await page.addScriptTag({ path: axePath });
  const results = await page.evaluate(() =>
    globalThis.axe.run(globalThis.document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    })
  );
  assert.deepEqual(
    results.violations.map(({ id }) => id),
    [],
    'Automatically detected WCAG issues'
  );
}

async function setAppearance(page, design, mode) {
  await page.locator('.appearance-trigger').click();
  await page.locator(`input[name="appearance-design"][value="${design}"]`).check();
  await page.locator(`input[name="appearance-mode"][value="${mode}"]`).check();
  await page.locator('.appearance-trigger').press('Escape');
  await page.waitForFunction(
    ({ design, mode }) => {
      const root = globalThis.document.documentElement;
      return root.dataset.design === design && root.dataset.theme === mode;
    },
    { design, mode }
  );
}

try {
  await scenario('dealer-next-actions', { width: 320, height: 850 }, async (page) => {
    await page.goto(base + '/en/lease/ebike-007');
    await page.locator('#demo-role').selectOption('operator');
    await page.locator('#demo-date').fill('2026-11-06');
    const panel = page.getByRole('region', { name: 'Needs attention', exact: true });
    await panel.waitFor();
    const summary = panel.locator('summary');
    await summary.focus();
    await summary.press('Enter');
    assert.equal(await panel.locator('details').evaluate((element) => element.open), true);
    const prepare = panel.getByRole('link', { name: /Prepare item:.*ebike-007/ });
    await prepare.click();
    await page.waitForURL('**/en/lease/ebike-007#relist-heading');
    await page.locator('#relist-heading').waitFor();
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes += 1;
    });
    const refreshed = page.waitForResponse((response) =>
      response.url().includes('/api/spine/dealer?')
    );
    await panel.getByRole('button', { name: 'Refresh list' }).click();
    assert.equal((await refreshed).status(), 200);
    assert.equal(writes, 0, 'Reading the action list must not change financial records.');
    await noOverflow(page);
    await accessible(page);
  });

  await scenario('green-mobile-keyboard', { width: 320, height: 850 }, async (page) => {
    await page.goto(base + '/en');
    const menu = page.locator('.language-disclosure');
    const trigger = page.locator('.language-trigger');
    await trigger.focus();
    await trigger.press('Enter');
    assert.equal(await menu.evaluate((element) => element.open), true);
    assert.deepEqual(await menu.locator('a[lang]').allTextContents(), [
      'English',
      'Suomi',
      'Svenska',
      'Eesti',
    ]);
    assert.equal(await menu.locator('[aria-current="page"]').getAttribute('lang'), 'en');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('a[lang="fi"]').evaluate((el) => el.matches(':focus')), true);
    await page.emulateMedia({ forcedColors: 'active' });
    // Wait for the media change to reach computed styles before measuring the focus ring.
    await page.waitForFunction(() => {
      const link = globalThis.document.querySelector('.language-menu a[lang="fi"]');
      return (
        globalThis.matchMedia('(forced-colors: active)').matches &&
        link?.matches(':focus-visible') &&
        globalThis.getComputedStyle(link).outlineWidth === '3px'
      );
    });
    const focus = await page.locator('a[lang="fi"]').evaluate((el) => {
      const style = globalThis.getComputedStyle(el);
      return [el.matches(':focus-visible'), style.outlineWidth];
    });
    assert.deepEqual(focus, [true, '3px']);
    await noOverflow(page);
    await accessible(page);
    await page.keyboard.press('Escape');
    assert.equal(await menu.evaluate((element) => element.open), false);
    assert.equal(await trigger.evaluate((element) => element.matches(':focus')), true);
  });

  await scenario('northfina-dark', { width: 1280, height: 900 }, async (page) => {
    await page.goto(base + '/en/lease/ebike-003');
    await page.locator('#demo-customer').selectOption('cust-aino');
    await page.locator('#demo-date').fill('2026-11-05');
    await page.locator('#term-select').selectOption('36');
    await page.locator('#down').fill('0');
    await page.locator('#start').fill('2026-11-05');
    await page.locator('.price-headline').waitFor();
    await setAppearance(page, 'northfina', 'dark');
    await page.locator('.language-trigger').click();
    await noOverflow(page);
    await accessible(page);
    assert.match(await page.locator('.price-headline').innerText(), /134[.,]66/);
    await page.locator('.appearance-trigger').click();
    assert.equal(await page.locator('.language-disclosure').getAttribute('open'), null);
  });

  await scenario('locale-and-draft', { width: 390, height: 850 }, async (page) => {
    await page.goto(base + '/en/lease/ebike-003?source=smoke');
    await page.locator('#demo-customer').selectOption('cust-aino');
    await page.locator('#demo-date').fill('2026-11-05');
    await page.locator('#term-select').selectOption('24');
    await page.locator('#down').fill('100');
    await setAppearance(page, 'northfina', 'light');
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes += 1;
    });
    for (const locale of ['fi', 'sv', 'et', 'en']) {
      await page.locator('.language-trigger').click();
      const link = page.locator(`.language-menu a[lang="${locale}"]`);
      await page.waitForFunction(
        (locale) =>
          globalThis.document
            .querySelector(`.language-menu a[lang="${locale}"]`)
            ?.getAttribute('href') === `/${locale}/lease/ebike-003?source=smoke`,
        locale
      );
      await link.click();
      await page.waitForURL(`**/${locale}/lease/ebike-003?source=smoke`);
      await page.locator('#down').waitFor();
      assert.equal(await page.locator('#down').inputValue(), '100');
      assert.equal(await page.locator('#term-select').inputValue(), '24');
      assert.equal(await page.locator('html').getAttribute('lang'), locale);
      assert.equal(await page.locator('html').getAttribute('data-design'), 'northfina');
    }
    assert.equal(writes, 0, 'Changing language should not write financial records.');
  });
} finally {
  await browser.close();
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2));
}

const failed = results.filter((item) => !item.passed);
if (failed.length) throw new Error(`${failed.length} of ${results.length} UI smoke checks failed.`);
console.log(`All ${results.length} UI smoke checks passed.`);
