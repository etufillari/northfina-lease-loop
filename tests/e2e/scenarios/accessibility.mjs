// Accessibility: every main page checked with axe-core against WCAG 2.1 A and AA, in light
// and dark mode, as a guest and as a customer with a running lease. Any violation fails.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { leaseFor } from './helpers.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function audit(page, check, path, label = path) {
  await page.open(path);
  await page.js(AXE);
  const violations = await page.js(`axe
    .run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
    .then((r) => r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    })))`);
  // What a screen reader relies on beyond axe's rules: the right language for the voice, one
  // main heading to jump to, a page title, and a skip link to the content.
  const basics = await page.js(`({
    lang: document.documentElement.lang,
    h1: document.querySelectorAll('h1').length,
    title: document.title.trim().length > 0,
    skip: !!document.querySelector('a[href="#main"]') && !!document.getElementById('main'),
  })`);
  const locale = path.split('/')[1];
  check(
    `${label}: lang="${locale}", one h1, a title and a skip link`,
    basics.lang === locale && basics.h1 === 1 && basics.title && basics.skip,
    JSON.stringify(basics)
  );
  check(
    `${label}: no WCAG 2.1 AA violations`,
    violations.length === 0,
    violations
      .map((v) => `${v.impact} ${v.id}: ${v.help} → ${v.targets.join(' | ')}`)
      .join('\n      ')
  );
}

export default async function accessibility(page, check) {
  const guestPages = [
    '/en',
    '/en/catalogue',
    '/en/catalogue?page=2',
    '/fi',
    '/fi/catalogue',
    '/en/assets/ebike-003',
    '/en/apply?asset=ebike-003&term=36&down=0',
    '/en/fleet',
    '/en/contracts',
    '/en/invoices',
    '/en/notifications',
    '/en/admin',
    '/en/admin/second-life',
    '/en/admin/second-life/ebike-007',
    '/en/admin/signatures',
  ];
  for (const path of guestPages) await audit(page, check, path);

  // A signature request (card 6), when an earlier scenario left one.
  await page.open('/en/admin/signatures');
  const request = await page.js(
    `document.querySelector('main a[href^="/en/admin/signatures/"]')?.getAttribute('href') ?? null`
  );
  if (request) await audit(page, check, request, 'signature request page');

  await page.actAs('cust-aino');
  const contract = await leaseFor(page, 'laptop-005', 'Aino Virtanen');
  await audit(page, check, `/en/apply?asset=ebike-001&term=24&down=0`, 'application form as Aino');
  await audit(page, check, `/en/contracts/${contract.id}`, 'contract page');
  await audit(page, check, `/en/contracts/${contract.id}/invoices/1`, 'invoice page');
  await audit(page, check, `/en/contracts/${contract.id}/exit`, 'early exit page');
  await audit(page, check, `/en/contracts/${contract.id}/invoices/1/pay`, 'payment page');

  // Dark mode has its own colours, so its contrast is checked too.
  await page.js(`document.cookie = 'lease-loop-date=; path=/; max-age=0'`);
  await page.emulateDark(true);
  for (const path of [
    '/en',
    '/en/catalogue',
    '/en/assets/ebike-003',
    `/en/contracts/${contract.id}`,
    '/en/admin',
  ]) {
    await audit(page, check, path, `${path} (dark)`);
  }
  await page.emulateDark(false);
}
