// The home page: a welcome and the two ways in (one item from the catalogue, or a fleet).
// Old catalogue links with filters still land on the catalogue.
export default async function home(page, check) {
  await page.open('/en');
  const heading = await page.js(`document.querySelector('main h1')?.innerText ?? ''`);
  check('the home page welcomes you', heading.includes('Welcome'), heading);
  check(
    'it links to the catalogue',
    await page.js(`!!document.querySelector('main a[href="/en/catalogue"]')`)
  );
  check(
    'it links to leasing several items at once',
    await page.js(`!!document.querySelector('main a[href="/en/fleet"]')`)
  );
  check(
    'the header links to the catalogue',
    await page.js(`!!document.querySelector('header a[href="/en/catalogue"]')`)
  );

  await page.open('/fi?category=laptop');
  const landed = await page.js(`location.pathname + location.search`);
  check('an old catalogue link keeps working', landed === '/fi/catalogue?category=laptop', landed);
}
