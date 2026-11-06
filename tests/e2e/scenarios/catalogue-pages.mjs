// The catalogue shows 10 items at a time, with page links and a choice of page size. A new
// filter starts again at page 1, and "Back to catalogue" from an item returns to its page.
const cards = `[...document.querySelectorAll('main ul li h3 a')].map((a) => a.getAttribute('href'))`;
const status = `document.querySelector('main p[role=status]').innerText`;
const where = `location.pathname + location.search`;
const pageNav = `document.querySelector('main nav[aria-label="Pages"]')`;

export default async function cataloguePages(page, check) {
  await page.open('/en/catalogue');
  const first = await page.js(cards);
  const shown = await page.js(status);
  const total = Number(shown.match(/of (\d+) items/)?.[1]);
  check('10 items on the first page', first.length === 10, `${first.length}: ${shown}`);
  check('it says which ones', shown.startsWith('Showing 1–10 of'), shown);
  check('there are page links', total > 10 && (await page.js(`!!${pageNav}`)), shown);

  await page.click('main nav a', 'Next');
  const second = await page.js(cards);
  check('Next shows the next 10', (await page.js(status)).startsWith('Showing 11–'));
  check(
    '…and no item twice',
    second.every((href) => !first.includes(href)),
    second.join(' ')
  );
  check('the page is in the URL', (await page.js(where)) === '/en/catalogue?page=2');
  check(
    'the current page is marked for screen readers',
    (await page.js(`${pageNav}.querySelector('[aria-current=page]')?.innerText`)) === '2'
  );
  check(
    'an item links back to this page',
    second[0]?.includes('page=2') ?? false,
    String(second[0])
  );

  await page.open(second[0]);
  const back = await page.js(
    `[...document.querySelectorAll('main a')].find((a) => a.innerText.includes('Back to catalogue'))?.getAttribute('href')`
  );
  check('"Back to catalogue" returns to page 2', back === '/en/catalogue?page=2', String(back));

  await page.open('/en/catalogue?page=2');
  await page.set('main select:not([name])', '50');
  const all = await page.js(cards);
  check('50 per page shows every item', all.length === total, `${all.length} of ${total}`);
  check('…on one page, so no page links', !(await page.js(`!!${pageNav}`)));
  check('the page size is in the URL', (await page.js(where)) === '/en/catalogue?per=50');

  await page.set('main select:not([name])', '10');
  await page.click('main nav a', 'Next');
  await page.click('main nav[aria-label="Category"] a', 'Laptops');
  check(
    'a new filter starts again at page 1',
    (await page.js(where)) === '/en/catalogue?category=laptop',
    await page.js(where)
  );

  await page.open('/fi/catalogue?page=99&per=20');
  const last = await page.js(status);
  check('a page past the end shows the last page', last.includes(`–${total} /`), last);
}
