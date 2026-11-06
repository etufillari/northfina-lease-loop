// Cards 1 and 3, and paying while time travelling: Aino's e-bike rent, the VAT change in
// January 2027, and a payment that disappears when travelling back before it.
import { leaseFor } from './helpers.mjs';

export default async function invoices(page, check) {
  await page.actAs('cust-aino');
  await page.travelTo('2026-11-05');
  // ebike-012 is the same model and price as card 1's ebike-003 (389000, band B).
  const contract = await leaseFor(page, 'ebike-012', 'Aino Virtanen', 36);
  check('card 1: monthly rent 107.30 € excl. VAT', contract.monthlyNetCents === 10_730);

  await page.travelTo('2027-01-20');
  await page.open(`/en/contracts/${contract.id}/invoices/2`);
  const december = await page.text();
  check(
    'card 3: the December invoice has 25.5 % VAT',
    december.includes('25.5 %'),
    december.slice(0, 300)
  );
  check('card 3: …and costs 134.66 €', december.includes('€134.66'));
  await page.open(`/en/contracts/${contract.id}/invoices/3`);
  const january = await page.text();
  check(
    'card 3: the January invoice has 26 % VAT',
    january.includes('26 %'),
    january.slice(0, 300)
  );
  check('card 3: …and costs 135.20 €', january.includes('€135.20'));

  await page.open(`/en/contracts/${contract.id}/invoices/3/pay`);
  await page.click('main button', 'Pay');
  await page.open(`/en/contracts/${contract.id}/invoices/3`);
  check('paying marks the invoice paid', (await page.text()).includes('Paid on'));
  await page.travelTo('2027-01-10');
  await page.open(`/en/contracts/${contract.id}/invoices/3`);
  check(
    'travelling back to before the payment: unpaid again',
    !(await page.text()).includes('Paid on')
  );
}
