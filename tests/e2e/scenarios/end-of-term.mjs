// End of term: a lease that has ended must be settled first; then Aino buys the item, which
// leaves the catalogue and shows up in the admin page's sold tally, and travelling back shows
// the lease running again.
import { leaseFor } from './helpers.mjs';

const panel = (page) =>
  page.js(`document.querySelector('#end-of-term-heading + p')?.innerText ?? ''`);

export default async function endOfTerm(page, check) {
  await page.actAs('cust-aino');
  await page.travelTo('2026-09-15');
  const contract = await leaseFor(page, 'laptop-009', 'Aino Virtanen', 12);

  await page.travelTo('2027-09-16');
  await page.open(`/en/contracts/${contract.id}/end`);
  const buyDisabled = () =>
    page.js(
      `[...document.querySelectorAll('main button')].find((b) => b.innerText.startsWith('Buy it'))?.disabled`
    );
  check('with open invoices, buying is not possible yet', (await buyDisabled()) === true);

  const paid = await page.post('/api/invoices/pay-all', { contractId: contract.id });
  check('paying every open invoice works', paid.success === true, JSON.stringify(paid.error));
  await page.open(`/en/contracts/${contract.id}/end`);
  check('once settled, it can be bought', (await buyDisabled()) === false);
  await page.click('main button', 'Buy it for');
  await page.waitFor(`location.pathname === '/en/contracts/${contract.id}'`);
  await page.open(`/en/contracts/${contract.id}`);
  const bought = await panel(page);
  check('the contract says it was bought', bought.startsWith('The item was bought'), bought);

  // A sold item has left the loop: not in the catalogue, but in the admin page's tally.
  await page.open('/en/catalogue?per=50');
  check(
    'the sold item is not in the catalogue',
    !(await page.js(`!!document.querySelector('main a[href^="/en/assets/laptop-009"]')`))
  );
  check(
    'the catalogue has no "Sold" status to pick',
    !(await page.js(`!!document.querySelector('main select[name=status] option[value=sold]')`))
  );
  await page.open('/en/admin');
  const sold = await page.js(
    `document.getElementById('sold-heading')?.closest('section')?.innerText ?? ''`
  );
  check('admin: the sold item is in the tally', sold.includes('laptop-009'), sold.slice(0, 300));

  await page.travelTo('2027-03-01');
  await page.open(`/en/contracts/${contract.id}`);
  const before = await panel(page);
  check('travelling back: the lease is running again', before.startsWith('Running'), before);
}
