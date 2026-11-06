// Runs against an isolated, seeded production build. Never target a live customer database.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const tools = process.env.UI_QA_TOOLS;
const output = process.env.UI_OUTPUT_DIR;
if (!tools || !output) throw new Error('Set UI_QA_TOOLS and UI_OUTPUT_DIR.');
const requireTool = createRequire(resolve(tools, 'package.json'));
const { chromium } = requireTool('playwright');
const axePath = requireTool.resolve('axe-core/axe.min.js');
const base = process.env.UI_BASE_URL ?? 'http://127.0.0.1:3000';
const results = [];

for (let attempt = 0; attempt < 60; attempt += 1) {
  try {
    if ((await fetch(base + '/en')).ok) break;
  } catch {
    // The production server is starting.
  }
  if (attempt === 59) throw new Error('Demo server did not start.');
  await delay(250);
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch();

async function scenario(name, options, test) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await test(page);
    assert.deepEqual(errors, [], 'Unexpected browser errors');
    results.push({ name, passed: true });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, passed: false, error: String(error) });
    await page.screenshot({ path: resolve(output, name + '-failure.png') }).catch(() => {});
    console.error('FAIL ' + name + ': ' + String(error));
  } finally {
    await context.close();
  }
}

async function openTrap(page, locale = 'en') {
  await page.goto(base + '/' + locale + '/lease/laptop-003');
  await page.locator('#demo-customer').selectOption('cust-aino');
  await page.locator('#demo-date').fill('2026-11-05');
  await page.locator('#term-select').selectOption('36');
  await page.locator('#start').fill('2026-11-05');
  await page.locator('#down').fill('50');
  await page.locator('#guardian-choose').waitFor();
}

function collectWrites(page) {
  const writes = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/spine/') && !['GET', 'HEAD'].includes(request.method())) {
      writes.push({ method: request.method(), url: request.url() });
    }
  });
  return writes;
}

async function checkGuardianLayout(page) {
  const box = await page.locator('#price-guardian').boundingBox();
  const width = page.viewportSize().width;
  assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, 'Guardian fits the viewport');
  await page.locator('#guardian-choose').scrollIntoViewIfNeeded();
  const button = await page.locator('#guardian-choose').boundingBox();
  assert.ok(button && button.x >= 0 && button.x + button.width <= width + 1);
  await page.addScriptTag({ path: axePath });
  const accessibility = await page.evaluate(() =>
    globalThis.axe.run(globalThis.document.querySelector('#price-guardian'), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    })
  );
  assert.deepEqual(
    accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((n) => n.target) })),
    [],
    'Automatically detected accessibility issues in Price Guardian'
  );
}

try {
  for (const locale of ['en', 'fi', 'sv', 'et']) {
    for (const mode of ['light', 'dark']) {
      const name = locale + '-' + mode;
      const viewport =
        mode === 'light' ? { width: 1280, height: 900 } : { width: 390, height: 850 };
      await scenario(name, { viewport, colorScheme: mode }, async (page) => {
        const writes = collectWrites(page);
        await openTrap(page, locale);
        const text = await page.locator('#price-guardian').innerText();
        assert.match(text, /92[.,]25/);
        assert.match(text, /82[.,]80/);
        assert.match(text, /9[.,]45/);
        assert.doesNotMatch(text, /\{\w+\}|guardian\.[A-Za-z]+/);
        assert.equal(await page.locator('html').getAttribute('lang'), locale);
        await checkGuardianLayout(page);
        await page.locator('#price-guardian').screenshot({ path: resolve(output, name + '.png') });
        if (locale === 'fi' && mode === 'dark') {
          await page.addStyleTag({ content: 'html { font-size: 200%; }' });
          await checkGuardianLayout(page);
        }
        assert.deepEqual(writes, [], 'Viewing a suggestion must not write business records');
      });
    }
  }

  for (const mode of ['light', 'dark']) {
    await scenario(
      'northfina-' + mode,
      { viewport: { width: 390, height: 850 }, colorScheme: mode },
      async (page) => {
        const writes = collectWrites(page);
        await openTrap(page);
        await page.locator('.appearance-trigger').click();
        await page.locator('input[name="appearance-design"][value="northfina"]').check();
        await page.locator('input[name="appearance-mode"][value="' + mode + '"]').check();
        assert.equal(await page.locator('html').getAttribute('data-design'), 'northfina');
        assert.equal(await page.locator('html').getAttribute('data-theme'), mode);
        await checkGuardianLayout(page);
        await page.locator('#price-guardian').screenshot({
          path: resolve(output, 'northfina-' + mode + '.png'),
        });
        assert.deepEqual(writes, [], 'Switching design must not write business records');
      }
    );
  }

  await scenario(
    'keyboard-draft-save',
    { viewport: { width: 1280, height: 900 } },
    async (page) => {
      const writes = collectWrites(page);
      await openTrap(page);
      await page.locator('#guardian-choose').focus();
      await page.locator('#guardian-choose').press('Enter');
      await page.waitForFunction(() => globalThis.document.activeElement?.id === 'down');
      assert.match(await page.locator('#down').inputValue(), /^0(?:[.,]00)?$/);
      assert.equal(await page.locator('#term-select').inputValue(), '36');
      assert.equal(await page.locator('#start').inputValue(), '2026-11-05');
      await page.locator('#price-guardian').waitFor({ state: 'detached' });
      await page.reload();
      await page.locator('#down').waitFor();
      assert.match(await page.locator('#down').inputValue(), /^0(?:[.,]00)?$/);
      for (const locale of ['fi', 'sv', 'et', 'en']) {
        await page.goto(base + '/' + locale + '/lease/laptop-003');
        await page.locator('#down').waitFor();
        assert.match(await page.locator('#down').inputValue(), /^0(?:[.,]00)?$/);
        assert.equal(await page.locator('#term-select').inputValue(), '36');
      }
      assert.deepEqual(writes, [], 'Selection, reload and locale changes only edit the draft');
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/spine/quotes') && response.request().method() === 'POST'
      );
      await page.locator('#save-quote').click();
      const response = await responsePromise;
      assert.equal(response.status(), 200);
      const saved = await response.json();
      assert.equal(saved.success, true);
      assert.equal(saved.data.terms.downPaymentCents, 0);
      assert.equal(saved.data.terms.monthlyNetCents, 5517);
      assert.equal(saved.data.priceSource, 'list:1');
      await page.locator('#application-heading').waitFor();
      await page.reload();
      await page.locator('#application-heading').waitFor();
      assert.equal(await page.locator('#price-guardian').count(), 0);
      assert.equal(writes.length, 1, 'Only explicit save creates a quote');
    }
  );

  await scenario(
    'invalid-and-changed-offer',
    { viewport: { width: 390, height: 850 } },
    async (page) => {
      const writes = collectWrites(page);
      await openTrap(page);
      await page.locator('#down').fill('-1');
      await page.locator('#price-guardian').waitFor({ state: 'detached' });
      await page.locator('#down').fill('0.01');
      await page.locator('#guardian-choose').waitFor();
      await page.locator('#down').fill('50');
      await page.locator('#demo-date').fill('2026-11-06');
      await page.locator('#start').fill('2026-11-06');
      await page.locator('#price-guardian').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#save-quote').isEnabled(), true);
      assert.deepEqual(writes, [], 'Changing inputs or dates must not save a quote');
    }
  );
} finally {
  await browser.close();
  await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2));
}

const failed = results.filter((result) => !result.passed);
if (failed.length) throw new Error(`${failed.length} of ${results.length} Guardian checks failed.`);
console.log(`All ${results.length} Guardian browser checks passed.`);
