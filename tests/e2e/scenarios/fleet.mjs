// Fleet leasing and card 6: Norvi picks four laptops; the applicant may not sign (manual
// review); once a signatory applies, one signature signs every contract.
const decision = (page) =>
  page.js(`document.querySelector('form [aria-live=polite]')?.innerText ?? ''`);

export default async function fleet(page, check) {
  await page.actAs('cust-norvi');
  // 5 Nov 2026: price list v1 (laptops are 8 % cheaper from the 6th).
  await page.travelTo('2026-11-05');
  await page.open('/en');
  check(
    'the catalogue links to fleet leasing',
    await page.js(`!!document.querySelector('main a[href="/en/fleet"]')`)
  );
  await page.open('/en/fleet');
  await page.set('main select', 'laptop');
  for (const id of ['laptop-001', 'laptop-002', 'laptop-003', 'laptop-004']) {
    await page.js(
      `[...document.querySelectorAll('main fieldset li label')].find((l) => l.innerText.includes('${id}')).querySelector('input').click()`
    );
  }
  await page.waitFor(`!!document.querySelector('form button[type=submit]')`);
  const summary = await page.js(
    `document.querySelector('[aria-live=polite]').innerText.replace(/\\s+/g, ' ')`
  );
  check('4 laptops add up to 8,688.99 € financed', summary.includes('€8,688.99'), summary);

  await page.open('/fi/fleet');
  const fi = await page.js(`document.querySelector('[aria-live=polite] p')?.innerText ?? ''`);
  check('switching language keeps the choice', fi.startsWith('4 tuotetta'), fi);
  await page.open('/en/fleet');
  // Norvi's answers are prefilled from the data pack, including "can't sign".
  await page.waitFor(
    `document.querySelector('form [aria-live=polite]').innerText.includes('person will check')`,
    3000
  );
  const review = await decision(page);
  check(
    'card 6: an applicant who may not sign goes to a person',
    review.includes('person will check'),
    review
  );
  check(
    'card 6: …because they can’t sign for the company',
    review.includes('can’t sign for the company')
  );

  await page.js(`document.querySelector('input[name=q_can_sign][value=yes]').click()`);
  await page.waitFor(
    `document.querySelector('form [aria-live=polite]').innerText.startsWith('Yes')`,
    3000
  );
  await page.click('form button[type=submit]');
  await page.waitFor(`!!document.querySelector('[role=status] a')`);
  await page.click('[role=status] a');
  await page.waitFor(
    `location.pathname.startsWith('/en/fleets/') && !!document.querySelector('main table')`
  );
  await page.js(`document.querySelector('form input[type=checkbox]').click()`);
  await page.click('form button[type=submit]');
  const signed = await page.waitFor(
    `document.querySelector('main').innerText.includes('Signed on')`
  );
  check('one signature signs the fleet', signed);
  const links = await page.js(
    `[...document.querySelectorAll('main table a')].map((a) => a.getAttribute('href'))`
  );
  check('every laptop has its own contract', links.length === 4, String(links.length));
  await page.open(links[0]);
  check(
    'each contract links back to its fleet',
    await page.js(`!!document.querySelector('a[href^="/en/fleets/"]')`)
  );
}
