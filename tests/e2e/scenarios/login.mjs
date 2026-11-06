// Demo login and card 5: each customer sees only their own contracts, and Mikko (17) is told
// kindly why he can't lease.
import { leaseFor } from './helpers.mjs';

export default async function login(page, check) {
  await page.actAs('cust-aino');
  const contract = await leaseFor(page, 'ebike-006', 'Aino Virtanen');
  await page.open(`/en/contracts/${contract.id}`);
  check(
    'Aino sees her contract',
    await page.js(`!!document.querySelector('#end-of-term-heading')`)
  );

  await page.actAs('cust-mikko');
  await page.open(`/en/contracts/${contract.id}`);
  const mikkoSees = await page.text();
  check(
    'Mikko is told the contract is someone else’s',
    !(await page.js(`!!document.querySelector('#end-of-term-heading')`)) &&
      mikkoSees.includes('Aino'),
    mikkoSees.slice(0, 200)
  );

  // Card 5: the form is prefilled from Mikko's details and answers straight away.
  await page.open('/en/apply?asset=laptop-008&term=24&down=0');
  const decision = await page.js(
    `document.querySelector('form [aria-live=polite]')?.innerText ?? ''`
  );
  check('card 5: Mikko is declined', decision.includes('can’t offer'), decision);
  check('card 5: the reason is his age, kindly', decision.includes('at least 18'), decision);
  check(
    'card 5: he can’t send it',
    await page.js(`document.querySelector('form button[type=submit]').disabled`)
  );
}
