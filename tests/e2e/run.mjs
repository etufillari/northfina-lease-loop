// Browser tests: drives the real app in headless Chrome through the judges' scenario cards
// and checks every page with axe-core for accessibility problems.
//
//   npm run build && npm run test:e2e            # starts its own server on a fresh database
//   E2E_BASE_URL=http://localhost:3000 npm run test:e2e -- a11y   # against a running app
//
// Arguments pick scenarios by name (default: all). Set CHROME_PATH if Chrome isn't found.
import { launch } from './browser.mjs';
import { startServer } from './server.mjs';
import accessibility from './scenarios/accessibility.mjs';
import cataloguePages from './scenarios/catalogue-pages.mjs';
import earlyExit from './scenarios/early-exit.mjs';
import endOfTerm from './scenarios/end-of-term.mjs';
import fleet from './scenarios/fleet.mjs';
import home from './scenarios/home.mjs';
import invoices from './scenarios/invoices.mjs';
import login from './scenarios/login.mjs';
import secondLife from './scenarios/second-life.mjs';
import signatures from './scenarios/signatures.mjs';
import theme from './scenarios/theme.mjs';

const SCENARIOS = {
  home,
  'catalogue-pages': cataloguePages,
  login,
  invoices,
  'end-of-term': endOfTerm,
  'second-life': secondLife,
  'early-exit': earlyExit,
  fleet,
  signatures,
  theme,
  a11y: accessibility,
};

const picked = process.argv.slice(2);
const names = picked.length > 0 ? picked : Object.keys(SCENARIOS);
const unknown = names.filter((name) => !SCENARIOS[name]);
if (unknown.length > 0) {
  console.error(
    `Unknown scenario(s): ${unknown.join(', ')}. Known: ${Object.keys(SCENARIOS).join(', ')}`
  );
  process.exit(2);
}

const server = process.env.E2E_BASE_URL ? null : await startServer();
const baseUrl = process.env.E2E_BASE_URL ?? server.baseUrl;
const page = await launch(baseUrl);
let failures = 0;

for (const name of names) {
  console.log(`\n▶ ${name}`);
  const check = (label, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `\n      ${detail}` : ''}`);
  };
  try {
    // Every scenario starts as a guest on the real date.
    await page.open('/en');
    await page.actAs('guest');
    await page.js(`document.cookie = 'lease-loop-date=; path=/; max-age=0'`);
    await SCENARIOS[name](page, check);
  } catch (error) {
    failures++;
    console.log(`  ✗ crashed: ${error instanceof Error ? error.message : error}`);
  }
}
if (page.consoleErrors.length > 0) {
  failures++;
  console.log(`\n✗ ${page.consoleErrors.length} uncaught error(s) in the page:`);
  for (const error of page.consoleErrors.slice(0, 5)) console.log(`  ${error.split('\n')[0]}`);
}

await page.close();
await server?.stop();
console.log(failures === 0 ? '\nAll browser checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
